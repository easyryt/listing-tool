"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, QrCode, Smartphone, Square, Video } from "lucide-react";
import { EVIDENCE_LABELS, type EvidenceRole } from "@/lib/meesho-claims";
import { cameraChannel, cameraChunkBytes, cameraLimits, localCameraSdp, pairRequest, type CameraCommand, type CameraKind, type CameraNotice } from "@/lib/browser-phone-camera";
import ClaimCameraDialog from "./ClaimCameraDialog";
import ClaimPhonePhotoReview from "./ClaimPhonePhotoReview";
import ClaimPhoneTakeReview, { cameraPrimary as primary, cameraSecondary as secondary, type ReviewedVideo } from "./ClaimPhoneTakeReview";
import type { ClaimPhoneCameraProps } from "./ClaimPhoneCamera";

type Phase = "idle" | "preparing" | "waiting" | "connecting" | "ready" | "starting" | "recording" | "receiving" | "review";
type Capture = ReviewedVideo & { kind: CameraKind };
type Session = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  cancel: AbortController;
  reviewing: boolean;
  keys?: { id: string; key: string };
  timeout?: ReturnType<typeof setTimeout>;
};

const stateText: Record<Phase, string> = {
  idle: "Connect your phone camera", preparing: "Preparing pairing code…", waiting: "Scan with your phone",
  connecting: "Waiting for the phone camera…", ready: "Phone ready. Check the framing on the phone.", starting: "Starting recording…",
  recording: "Recording on the phone", receiving: "Receiving the capture…", review: "Review the capture before attaching it.",
};

function closeSession(session: Session) {
  clearTimeout(session.timeout);
  session.cancel.abort();
  session.peer.close();
  if (session.keys) void pairRequest("close", session.keys).catch(() => {});
}

export default function ClaimBrowserCamera({ available, disabled, onBusyChange, onUse, children }: ClaimPhoneCameraProps) {
  const active = useRef<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState<EvidenceRole>("video");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [mp4, setMp4] = useState(true);
  const [torch, setTorch] = useState<boolean>();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [saving, setSaving] = useState(false);

  const busy = ["starting", "recording", "receiving", "review"].includes(phase) || !!capture || saving;
  const connected = ["ready", "starting", "recording", "receiving", "review"].includes(phase);
  useEffect(() => { onBusyChange(available && busy); }, [available, busy, onBusyChange]);
  useEffect(() => () => { if (capture) URL.revokeObjectURL(capture.url); }, [capture]);
  useEffect(() => () => {
    const session = active.current;
    active.current = null;
    if (session) closeSession(session);
  }, []);

  function disconnect(session: Session, message = "") {
    if (session !== active.current) return;
    active.current = null;
    closeSession(session);
    setPhase("idle");
    setQr("");
    setTorch(undefined);
    setError(message);
  }

  async function connect() {
    if (active.current) return;
    setError("");
    if (!window.isSecureContext) {
      setError("Open Claims from a trusted HTTPS address your phone can reach. Then choose Connect phone to show the QR code.");
      return;
    }
    if (typeof RTCPeerConnection === "undefined") { setError("Open Claims in a current version of Chrome or Edge."); return; }
    const peer = new RTCPeerConnection();
    const channel = peer.createDataChannel(cameraChannel);
    const session: Session = { peer, channel, cancel: new AbortController(), reviewing: false };
    active.current = session;
    setPhase("preparing");
    channel.binaryType = "arraybuffer";
    let incoming: { kind: CameraKind; bytes: number; received: number; chunks: ArrayBuffer[] } | null = null;
    let ready = false;
    const unexpected = () => disconnect(session, "The phone sent an incomplete capture. Scan a new code to reconnect.");
    const armTimeout = (message: string, delay: number) => {
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => disconnect(session, message), delay);
    };
    channel.onmessage = ({ data }) => {
      if (active.current !== session) return;
      if (data instanceof ArrayBuffer) {
        if (!incoming || !data.byteLength || data.byteLength > cameraChunkBytes || incoming.received + data.byteLength > incoming.bytes) { unexpected(); return; }
        incoming.chunks.push(data);
        incoming.received += data.byteLength;
        armTimeout("The capture transfer stalled. Reconnect and try again.", 20_000);
        return;
      }
      if (typeof data !== "string" || data.length > 1024) { unexpected(); return; }
      let message: CameraNotice;
      try { message = JSON.parse(data); } catch { unexpected(); return; }
      if (!message || typeof message !== "object") { unexpected(); return; }
      if (message.type !== "ready" && !ready) { unexpected(); return; }
      switch (message.type) {
        case "ready":
          if (ready || typeof message.mp4 !== "boolean" || typeof message.torch !== "boolean") { unexpected(); return; }
          ready = true;
          clearTimeout(session.timeout);
          setQr("");
          setMp4(message.mp4);
          setTorch(message.torch ? false : undefined);
          setPhase("ready");
          break;
        case "torch":
          if (typeof message.enabled === "boolean") setTorch(message.enabled);
          break;
        case "recording":
          if (incoming || session.reviewing) { unexpected(); return; }
          clearTimeout(session.timeout);
          setTarget("video");
          setPhase("recording");
          setOpen(true);
          break;
        case "error":
          if (incoming || session.reviewing || typeof message.message !== "string") { unexpected(); return; }
          clearTimeout(session.timeout);
          setError(message.message);
          setPhase("ready");
          break;
        case "file":
          if (session.reviewing || incoming || (message.kind !== "photo" && message.kind !== "video") ||
            !Number.isSafeInteger(message.bytes) || message.bytes <= 0 || message.bytes > cameraLimits[message.kind]) { unexpected(); return; }
          incoming = { kind: message.kind, bytes: message.bytes, received: 0, chunks: [] };
          armTimeout("The capture transfer stalled. Reconnect and try again.", 20_000);
          setPhase("receiving");
          break;
        case "end": {
          if (!incoming || incoming.received !== incoming.bytes) { unexpected(); return; }
          clearTimeout(session.timeout);
          const { kind, chunks } = incoming;
          incoming = null;
          const take = crypto.randomUUID();
          const file = new File(chunks, `phone-${take}.${kind === "video" ? "mp4" : "jpg"}`, { type: kind === "video" ? "video/mp4" : "image/jpeg" });
          session.reviewing = true;
          setCapture({ take, file, kind, url: URL.createObjectURL(file) });
          setPhase("review");
          setOpen(true);
          if (channel.readyState === "open") channel.send("review" satisfies CameraCommand);
          break;
        }
        default: unexpected();
      }
    };
    channel.onclose = () => disconnect(session, "Phone disconnected. Connect again to take another capture.");
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") disconnect(session, "Could not connect. Check that both devices are on the same Wi-Fi.");
    };

    try {
      const sdp = await localCameraSdp(peer, "offer");
      if (active.current !== session) return;
      // Let creation finish even if the dialog closes so we can delete the resulting pairing.
      const pair = await pairRequest<{ id: string; laptop: string; qr: string; ttl: number }>("create", { sdp });
      session.keys = { id: pair.id, key: pair.laptop };
      if (active.current !== session) { closeSession(session); return; }
      setQr(pair.qr);
      setPhase("waiting");
      const deadline = Date.now() + pair.ttl * 1000;
      while (!session.cancel.signal.aborted && Date.now() < deadline) {
        const answer = await pairRequest<{ sdp: string | null }>("answer", session.keys, session.cancel.signal);
        if (answer.sdp) {
          setQr("");
          setPhase("connecting");
          armTimeout("Could not connect. Keep both devices on the same Wi-Fi and try again.", 25_000);
          await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
          void pairRequest("close", session.keys).catch(() => {});
          session.keys = undefined;
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1750));
      }
      if (!session.cancel.signal.aborted) disconnect(session, "Pairing code expired. Show a new QR code.");
    } catch (reason) { disconnect(session, reason instanceof Error ? reason.message : "Could not pair with the phone."); }

  }

  function openCamera(role: EvidenceRole) {
    if (!busy) setTarget(role);
    setOpen(true);
    if (!active.current && !capture) void connect();
  }

  function send(command: CameraCommand) {
    const session = active.current;
    if (!session || session.channel.readyState !== "open") return;
    try {
      session.channel.send(command);
      if (command === "start" || command === "photo" || command === "stop") {
        setError("");
        setPhase(command === "start" ? "starting" : "receiving");
        clearTimeout(session.timeout);
        session.timeout = setTimeout(() => disconnect(session, "The phone didn’t finish the request. Keep its camera open and reconnect."), 20_000);
      }
    } catch { disconnect(session, "Phone disconnected. Connect again to take another capture."); }
  }

  async function finish(file?: File, role: EvidenceRole = "video") {
    setSaving(true);
    try {
      if (file && !await onUse(file, role)) return;
      if (active.current) active.current.reviewing = false;
      send("accepted");
      setCapture(null);
      setPhase(active.current ? "ready" : "idle");
      if (role !== "video" && file) { setOpen(false); setTarget("video"); }
    } finally { setSaving(false); }
  }

  const connection = available && <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
    <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span aria-hidden="true" className={`size-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500 motion-safe:animate-pulse"}`} />
      {connected ? "Phone connected" : phase === "idle" ? "Phone disconnected" : "Waiting for phone"}
    </span>
    <button type="button" className={secondary} disabled={disabled} onClick={() => openCamera("video")}>
      {connected ? <Smartphone size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
      {capture ? "Review phone capture" : connected ? "Open phone camera" : "Connect phone"}
    </button>
  </div>;
  const cameraButton = (role: EvidenceRole) => {
    if (!available) return null;
    const Icon = role === "video" ? Video : Camera;
    const label = role === "video" ? "Record video with phone" : "Take photo with phone";
    return <button type="button" className={`${secondary} mt-2 w-full`} disabled={disabled || (busy && role !== target)}
      aria-label={role === "video" ? undefined : `${label} for ${EVIDENCE_LABELS[role].toLowerCase()}`} onClick={() => openCamera(role)}>
      <Icon size={17} aria-hidden="true" />{label}
    </button>;
  };

  return <>{children(connection, cameraButton)}{available && open && <ClaimCameraDialog title="Phone camera" closeDisabled={busy}
    onClose={() => { setOpen(false); if (active.current && !connected) disconnect(active.current); }}>
    {capture ? <div className="space-y-3 rounded-2xl bg-white p-4 text-slate-900 sm:p-5">
      <p className="text-sm font-semibold">{stateText.review}</p>
      {capture.kind === "photo" ? <ClaimPhonePhotoReview key={capture.take} photo={capture} locked={saving || disabled} attached={false}
        destination={target === "video" ? undefined : target} onFinish={finish} />
        : <ClaimPhoneTakeReview key={capture.take} video={capture} busy={saving || disabled} attached={false} canTrim={false} onFinish={finish} />}
    </div> : <div className="mx-auto flex min-h-[55dvh] max-w-lg flex-col items-center justify-center gap-4 text-center">
      <p role="status" className="font-medium">{stateText[phase]}</p>
      {qr && <div className="space-y-3 rounded-2xl bg-white p-5 text-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- The pairing endpoint returns a PNG data URL. */}
        <img src={qr} width={240} height={240} className="mx-auto" alt="QR code to connect the phone camera" />
        <p className="text-sm">Scan in Web Camera 1.0.6 or newer on Android.</p>
        <p className="text-xs text-slate-600">Use the same Wi-Fi on both devices.</p>
      </div>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {phase === "ready" && !mp4 && <p className="text-sm text-slate-300">This phone browser supports photos. For a video, add the original MP4 from the phone’s camera app.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {phase === "idle" && <button type="button" className={primary} disabled={disabled} onClick={() => void connect()}>Show pairing QR</button>}
        {phase === "ready" && <>
          {mp4 && target === "video" && <button type="button" className={primary} disabled={disabled} onClick={() => send("start")}><Video size={17} aria-hidden="true" /> Start recording</button>}
          <button type="button" className={secondary} disabled={disabled} onClick={() => send("photo")}><Camera size={17} aria-hidden="true" /> Take photo</button>
        </>}
        {phase === "recording" && <button type="button" className={primary} onClick={() => send("stop")}><Square size={17} aria-hidden="true" /> Stop recording</button>}
        {torch !== undefined && (phase === "ready" || phase === "recording") && <button type="button" className={secondary} aria-pressed={torch} onClick={() => send("torch")}><Flashlight size={17} aria-hidden="true" /> Flashlight</button>}
        {phase === "ready" && <button type="button" className={secondary} onClick={() => { if (active.current) disconnect(active.current); }}>Disconnect phone</button>}
      </div>
    </div>}
  </ClaimCameraDialog>}</>;
}
