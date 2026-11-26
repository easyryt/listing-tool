"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, Video } from "lucide-react";
import { cameraChannel, cameraLimits, localCameraSdp, pairRequest, sendCameraFile, type CameraKind, type CameraNotice } from "@/lib/browser-phone-camera";
import { cameraPrimary, cameraSecondary } from "./ClaimPhoneTakeReview";

type Phase = "idle" | "connecting" | "ready" | "recording" | "sending" | "review";
type Session = {
  peer: RTCPeerConnection;
  cancel: AbortController;
  stream?: MediaStream;
  capture?: (action: string) => Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
};

function recordingFormats() {
  if (typeof MediaRecorder === "undefined") return [];
  return ["video/mp4;codecs=avc1", "video/mp4"].filter(type => MediaRecorder.isTypeSupported(type));
}

function startMp4Recording(stream: MediaStream, formats: string[]) {
  for (const mimeType of formats) {
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
      recorder.start(500);
      return recorder;
    } catch { /* Some browsers advertise a codec that cannot start on this device. */ }
  }
  throw new Error("This browser could not start an MP4 recording. Use the phone camera app and add the original MP4 in Claims.");
}

function closeSession(session: Session) {
  session.cancel.abort();
  clearTimeout(session.timer);
  session.stream?.getTracks().forEach(track => track.stop());
  session.peer.close();
}

export default function BrowserCameraPhone() {
  const video = useRef<HTMLVideoElement>(null);
  const active = useRef<Session | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [supportsVideo, setSupportsVideo] = useState(true);
  const [torch, setTorch] = useState<boolean>();
  const [backup, setBackup] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => () => {
    const session = active.current;
    active.current = null;
    if (session) closeSession(session);
  }, []);
  useEffect(() => () => { if (backup) URL.revokeObjectURL(backup.url); }, [backup]);

  function disconnect(session: Session, message = "") {
    if (active.current !== session) return;
    active.current = null;
    closeSession(session);
    if (video.current) video.current.srcObject = null;
    setPhase("idle");
    setTorch(undefined);
    setError(message);
  }

  async function connect() {
    if (active.current) return;
    const [, id, key] = window.location.hash.match(/^#([\w-]{32})\.([\w-]{32})$/) ?? [];
    if (!id || !key) { setError("Scan the QR code shown in Claims on the laptop."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Open the camera link in a current version of Chrome or Safari over HTTPS.");
      return;
    }
    const peer = new RTCPeerConnection();
    const session: Session = { peer, cancel: new AbortController() };
    active.current = session;
    setError("");
    setPhase("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (session.cancel.signal.aborted) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (track?.readyState !== "live") throw new Error("The phone camera is unavailable. Close other camera apps and try again.");
      track.onended = () => disconnect(session, "The phone camera closed. Try again or scan a new code.");
      if (!video.current) throw new Error("The camera preview is unavailable.");
      video.current.srcObject = stream;
      await video.current.play();
      if (session.cancel.signal.aborted) return;
      const hasTorch = (track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined)?.torch === true;
      const formats = recordingFormats();
      setSupportsVideo(formats.length > 0);
      setTorch(hasTorch ? false : undefined);

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") disconnect(session, "Could not connect to the laptop. Check that both devices are on the same Wi-Fi and scan a new code.");
      };
      peer.ondatachannel = ({ channel }) => {
        if (channel.label !== cameraChannel || session.capture) { channel.close(); return; }
        let state: Phase = "connecting";
        let torchEnabled = false;
        let changingTorch = false;
        let recorder: MediaRecorder | undefined;
        let awaitingReceipt = false;
        const update = (next: Phase) => { state = next; if (active.current === session) setPhase(next); };
        const notify = (notice: CameraNotice) => { if (channel.readyState === "open") channel.send(JSON.stringify(notice)); };
        const failed = (reason: unknown) => {
          if (active.current !== session) return;
          const message = reason instanceof Error ? reason.message : "The capture did not finish.";
          setError(message);
          notify({ type: "error", message });
          update("ready");
        };
        const transfer = async (blob: Blob, kind: CameraKind) => {
          if (active.current !== session) return;
          if (!blob.size || blob.size > cameraLimits[kind]) throw new Error(kind === "video" ? "Record a clip under 100 MB." : "Take a photo under 10 MB.");
          setBackup({ url: URL.createObjectURL(blob), name: kind === "video" ? "phone-recording.mp4" : "phone-photo.jpg" });
          awaitingReceipt = true;
          await sendCameraFile(channel, blob, kind);
        };

        session.capture = async action => {
          if (active.current !== session) return;
          if (action === "review" && awaitingReceipt) { update("review"); return; }
          if (action === "accepted" && awaitingReceipt) {
            awaitingReceipt = false;
            setBackup(null);
            setError("");
            update("ready");
            return;
          }
          if (state === "ready" || state === "recording") setError("");
          if (action === "torch" && hasTorch && !changingTorch && (state === "ready" || state === "recording")) {
            changingTorch = true;
            try {
              await track.applyConstraints({ advanced: [{ torch: !torchEnabled } as MediaTrackConstraintSet] });
              if (active.current !== session) return;
              torchEnabled = !torchEnabled;
              setTorch(torchEnabled);
              notify({ type: "torch", enabled: torchEnabled });
            } catch {
              if (active.current === session) setError("The phone could not change the flashlight.");
            } finally { changingTorch = false; }
            return;
          }
          try {
            if (action === "stop" && state === "recording" && recorder?.state === "recording") {
              update("sending");
              recorder.stop();
            } else if (action === "start" && state === "ready") {
              const parts: Blob[] = [];
              let bytes = 0;
              const take = startMp4Recording(stream, formats);
              recorder = take;
              take.ondataavailable = event => {
                bytes += event.data.size;
                if (bytes <= cameraLimits.video && event.data.size) parts.push(event.data);
                if (bytes > cameraLimits.video && take.state === "recording") take.stop();
              };
              take.onstop = () => {
                if (active.current !== session || recorder !== take) return;
                recorder = undefined;
                update("sending");
                if (bytes > cameraLimits.video) { failed(new Error("The recording exceeded 100 MB. Record a shorter take.")); return; }
                void transfer(new Blob(parts, { type: "video/mp4" }), "video").catch(reason => disconnect(session, (reason as Error).message));
              };
              take.onerror = () => { recorder = undefined; failed(new Error("The browser could not record this video.")); };
              update("recording");
              notify({ type: "recording" });
            } else if (action === "photo" && state === "ready" && video.current) {
              const source = video.current;
              if (!source.videoWidth || !source.videoHeight) throw new Error("The camera preview is still loading.");
              update("sending");
              const canvas = document.createElement("canvas");
              canvas.width = source.videoWidth;
              canvas.height = source.videoHeight;
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Could not capture a photo.");
              context.drawImage(source, 0, 0);
              const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
              if (!photo) throw new Error("Could not capture a photo.");
              await transfer(photo, "photo").catch(reason => disconnect(session, (reason as Error).message));
            }
          } catch (reason) { failed(reason); }
        };
        const onOpen = () => {
          if (active.current !== session || state !== "connecting") return;
          clearTimeout(session.timer);
          update("ready");
          notify({ type: "ready", mp4: formats.length > 0, torch: hasTorch });
        };
        channel.onopen = onOpen;
        channel.onmessage = ({ data }) => { if (typeof data === "string") void session.capture?.(data); };
        channel.onclose = () => disconnect(session, "The laptop disconnected. Scan a new code to reconnect.");
        if (channel.readyState === "open") onOpen();
      };

      const offer = await pairRequest<{ sdp: string }>("offer", { id, key }, session.cancel.signal);
      await peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      const sdp = await localCameraSdp(peer, "answer");
      session.timer = setTimeout(() => disconnect(session, "Could not connect. Keep both devices on the same Wi-Fi and scan a new code."), 25_000);
      await pairRequest("join", { id, key, sdp }, session.cancel.signal);
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === "NotAllowedError"
        ? "Allow camera access in your browser, then try again."
        : (reason as Error).message;
      disconnect(session, message);
    }
  }

  const connected = phase === "ready" || phase === "recording" || phase === "sending" || phase === "review";
  const recording = phase === "recording";
  return <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8">
    <h1 className="text-xl font-semibold tracking-tight text-slate-950">Phone camera</h1>
    <video ref={video} autoPlay playsInline muted className={`max-h-[60dvh] w-full rounded-2xl bg-slate-950 object-contain ${phase === "idle" ? "hidden" : ""}`} />
    <p role="status" className="flex items-center gap-2 text-sm font-medium text-slate-700">
      {recording && <span className="size-2.5 rounded-full bg-rose-600 motion-safe:animate-pulse" aria-hidden="true" />}
      {phase === "idle" ? "Allow camera access to connect to your laptop." : phase === "connecting" ? "Connecting to laptop…" : recording ? "Recording" : phase === "sending" ? "Sending capture to laptop…" : phase === "review" ? "Review the capture on the laptop." : "Connected. Keep this tab open."}
    </p>
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    {connected && !supportsVideo && <p className="text-sm text-slate-600">This browser supports photos. For video, use the phone camera app and add the original MP4 in Claims.</p>}
    <div className="flex flex-wrap gap-2">
      {phase === "idle" && <button type="button" className={cameraPrimary} onClick={() => void connect()}>Enable camera</button>}
      {phase === "ready" && <button type="button" className={cameraSecondary} onClick={() => void active.current?.capture?.("photo")}><Camera size={17} aria-hidden="true" /> Take photo</button>}
      {connected && supportsVideo && <button type="button" className={cameraPrimary} disabled={phase !== "ready" && !recording} onClick={() => void active.current?.capture?.(recording ? "stop" : "start")}><Video size={17} aria-hidden="true" /> {recording ? "Stop recording" : "Start recording"}</button>}
      {connected && torch !== undefined && <button type="button" className={cameraSecondary} aria-pressed={torch} disabled={phase !== "ready" && !recording} onClick={() => void active.current?.capture?.("torch")}><Flashlight size={17} aria-hidden="true" /> Flashlight</button>}
      {phase !== "idle" && <button type="button" className={cameraSecondary} disabled={recording || phase === "sending"} onClick={() => { if (active.current) disconnect(active.current); }}>Disconnect</button>}
      {!connected && backup && <a className={cameraSecondary} href={backup.url} download={backup.name}>Save original capture</a>}
    </div>
  </main>;
}
