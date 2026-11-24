"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Camera, Flashlight, QrCode, Smartphone, Square, Video } from "lucide-react";
import { EVIDENCE_LABELS, type EvidenceRole } from "@/lib/meesho-claims";
import ClaimCameraDialog from "./ClaimCameraDialog";
import ClaimPhonePhotoReview from "./ClaimPhonePhotoReview";
import ClaimPhoneTakeReview, { cameraPrimary as primary, cameraSecondary as secondary, type ReviewedVideo } from "./ClaimPhoneTakeReview";

const bridge = "http://127.0.0.1:3222";
const pairingKey = "meesho.phone-camera.pairing.v1";

type Pairing = { id: string; controller: string; codes: { name: string; address: string; qr: string }[] };
type Phase = "waiting" | "connecting" | "ready" | "starting" | "recording" | "stopping" | "photographing" | "transferring" | "received" | "error";
type CaptureKind = "photo" | "video";
type Status = { phase: Phase; message?: string; take?: string; kind?: CaptureKind; torch?: boolean };
type CapturedMedia = ReviewedVideo & { kind: CaptureKind };
const waitingDot = "size-2.5 shrink-0 rounded-full bg-amber-500 motion-safe:animate-pulse";
const messages: Record<Phase, string> = {
  waiting: "Scan this QR code in the Web Camera app on your phone.",
  connecting: "Phone paired. Waiting for its camera…",
  ready: "Phone ready. Check the framing on the phone before recording.",
  starting: "Starting recording on the phone…",
  recording: "Recording on the phone",
  stopping: "Finishing recording on the phone…",
  photographing: "Taking a photo on the phone…",
  transferring: "Receiving the capture over Wi-Fi…",
  received: "Review the capture before attaching it.",
  error: "The phone connection ended. Pair it again to record.",
};

function getPairing(): Pairing | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(pairingKey) || "null");
    return saved && /^[\w-]{32}$/.test(saved.id) && /^[\w-]{32}$/.test(saved.controller) && Array.isArray(saved.codes) ? saved : null;
  } catch { return null; }
}

function remember(pairing: Pairing | null) {
  try {
    if (pairing) window.localStorage.setItem(pairingKey, JSON.stringify(pairing));
    else window.localStorage.removeItem(pairingKey);
  } catch { /* The current tab can still use an in-memory pairing. */ }
}

async function request(path: string, method = "GET", pairing?: Pairing, take?: string) {
  const response = await fetch(bridge + path, {
    method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(path.includes("/trim?") ? 130_000 : /\/(video|image)$/.test(path) ? 60_000 : 8000),
    headers: pairing ? { Authorization: `Bearer ${pairing.controller}`, ...(take ? { "X-Camera-Take": take } : {}) } : undefined,
  });
  if (!response.ok) throw Object.assign(new Error((await response.json()).message), { status: response.status });
  return response;
}

export default function ClaimPhoneCamera({ available, disabled, onBusyChange, onUse, children }: {
  available: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onUse: (file: File, role: EvidenceRole) => Promise<boolean>;
  children: (connection: ReactNode, cameraButton: (role: EvidenceRole) => ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<EvidenceRole>("video");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [addressIndex, setAddressIndex] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [capture, setCapture] = useState<CapturedMedia | null>(null);
  const [attachedTake, setAttachedTake] = useState("");
  const [acting, setActing] = useState(false);
  const [changingTorch, setChangingTorch] = useState(false);
  const [error, setError] = useState("");

  const phase = status?.phase;
  const connected = !!phase && !["waiting", "connecting", "error"].includes(phase);
  const working = phase === "recording" || phase === "starting" || phase === "stopping" || phase === "photographing" || phase === "transferring";
  const busy = acting || working || phase === "received" || !!capture;
  const photoTarget = target === "video" ? undefined : target;
  useEffect(() => { onBusyChange(available && busy); }, [available, busy, onBusyChange]);
  useEffect(() => () => { if (capture) URL.revokeObjectURL(capture.url); }, [capture]);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      const saved = getPairing();
      if (mounted && saved) setPairing(saved);
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;
    let timer: number;
    let failures = 0;
    let downloadedTake = "";
    const poll = async () => {
      try {
        const next: Status = await (await request(`/session/${pairing.id}`, "GET", pairing)).json();
        if (cancelled) return;
        setStatus(next);
        if (next.kind === "video") setTarget("video");
        if (next.phase === "received" && next.take && downloadedTake !== next.take) {
          const kind = next.kind || "video";
          const photo = kind === "photo";
          const blob = await (await request(`/session/${pairing.id}/${photo ? "image" : "video"}`, "GET", pairing, next.take)).blob();
          if (cancelled) return;
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const file = new File([blob], photo ? `phone-photo-${stamp}.jpg` : `phone-unboxing-${stamp}.mp4`, { type: photo ? "image/jpeg" : "video/mp4" });
          downloadedTake = next.take;
          setCapture({ take: next.take, kind, file, url: URL.createObjectURL(file) });
          setOpen(true);
        } else if (downloadedTake && next.take !== downloadedTake) {
          downloadedTake = "";
          setCapture(null);
        }
        failures = 0;
        timer = window.setTimeout(poll, next.phase === "ready" || next.phase === "received" ? 1250 : 500);
      } catch (reason) {
        if (cancelled) return;
        if ((reason as { status?: number }).status === 404) {
          if (getPairing()?.id === pairing.id) remember(null);
          setPairing(null);
          setStatus({ phase: "error", message: "Pairing ended. Show a new QR code to connect." });
          return;
        }
        failures += 1;
        if (failures >= 3) setStatus({ phase: "connecting", message: "Reconnecting to the camera bridge…" });
        timer = window.setTimeout(poll, failures < 3 ? 1000 : 2500);
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pairing]);

  const connect = async () => {
    setOpen(true);
    setActing(true);
    setError("");
    setStatus(null);
    try {
      const next: Pairing = await (await request("/session", "POST")).json();
      remember(next);
      setPairing(next);
      setAddressIndex(0);
      setStatus({ phase: "waiting" });
    } catch (reason) {
      setError(reason instanceof TypeError || (reason as Error).name === "TimeoutError"
        ? "Start npm run phone-camera on the laptop and open the claims page at localhost:3000."
        : (reason as Error).message);
    } finally { setActing(false); }
  };

  const disconnect = async () => {
    setActing(true);
    if (pairing) await request(`/session/${pairing.id}`, "DELETE", pairing).catch(() => {});
    if (!pairing || getPairing()?.id === pairing.id) remember(null);
    setPairing(null);
    setStatus(null);
    setCapture(null);
    setOpen(false);
    setTarget("video");
    setActing(false);
  };

  const send = async (action: "start" | "stop" | "photo") => {
    if (!pairing) return;
    setActing(true);
    setError("");
    try { setStatus(await (await request(`/session/${pairing.id}/${action}`, "POST", pairing, action === "stop" ? status?.take : undefined)).json()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setActing(false); }
  };

  const toggleTorch = async () => {
    if (!pairing || typeof status?.torch !== "boolean") return;
    setChangingTorch(true);
    setError("");
    try {
      const action = status.torch ? "torch-off" : "torch-on";
      const next: Status = await (await request(`/session/${pairing.id}/${action}`, "POST", pairing)).json();
      setStatus(current => current ? { ...current, torch: next.torch } : current);
    } catch (reason) { setError((reason as Error).message); }
    finally { setChangingTorch(false); }
  };

  const finish = async (file?: File, role: EvidenceRole = "video") => {
    if (!capture) return;
    setActing(true);
    setError("");
    try {
      if (file && attachedTake !== capture.take) {
        if (!await onUse(file, role)) return;
        setAttachedTake(capture.take);
      }
      if (pairing) {
        const next: Status = await (await request(`/session/${pairing.id}/release`, "POST", pairing, capture.take)).json();
        setStatus(next);
      }
      setCapture(null);
      if (photoTarget && (file || attachedTake === capture.take)) {
        setOpen(false);
        setTarget("video");
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { setActing(false); }
  };

  const openCamera = (role: EvidenceRole) => {
    if (!busy) setTarget(role);
    if (pairing || capture) setOpen(true);
    else void connect();
  };

  const connection = available && <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
    <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span aria-hidden="true" className={connected ? "size-2.5 shrink-0 rounded-full bg-emerald-500" : waitingDot} />
      {connected ? "Phone connected" : pairing || acting ? "Waiting for phone" : "Phone disconnected"}
    </span>
    <button type="button" className={secondary} disabled={disabled || acting} onClick={() => openCamera("video")}>
      {pairing || capture ? <Smartphone size={17} aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}
      {capture ? (capture.kind === "photo" ? "Review phone photo" : "Review phone recording") : connected ? "Open phone camera" : "Connect phone"}
    </button>
  </div>;

  const cameraButton = (role: EvidenceRole) => {
    if (!available) return null;
    const video = role === "video";
    const Icon = video ? Video : Camera;
    const label = video ? (capture?.kind === "video" ? "Review phone recording" : "Record video with phone")
      : capture?.kind === "photo" && role === target ? "Review phone photo" : "Take photo with phone";
    return <button type="button" disabled={disabled || (busy && role !== target)} className={`${secondary} mt-2 w-full`}
      aria-label={video ? undefined : `${label} for ${EVIDENCE_LABELS[role].toLowerCase()}`} onClick={() => openCamera(role)}>
      <Icon size={17} aria-hidden="true" />
      {label}
    </button>;
  };

  const code = pairing?.codes[addressIndex];
  const note = status ? status.message || (phase === "ready" && photoTarget ? "Phone ready. Check the framing on the phone before taking the photo." : messages[status.phase])
    : pairing ? "Restoring phone connection…" : acting ? "Creating pairing code…" : "Connect to your phone";
  return <>{children(connection, cameraButton)}{available && open && <ClaimCameraDialog
    title={photoTarget ? `Phone camera for ${EVIDENCE_LABELS[photoTarget].toLowerCase()}` : "Phone camera"}
    closeDisabled={acting || working}
    onClose={() => { setOpen(false); if (!busy) setTarget("video"); }}>
    <div className={capture ? "space-y-4 rounded-2xl bg-white p-3.5 text-slate-900 sm:p-5" : "mx-auto flex min-h-[65dvh] max-w-2xl flex-col items-center justify-center gap-5 text-center"}>
    {!capture && phase !== "waiting" && <div className="grid size-20 place-items-center rounded-3xl border border-white/10 bg-white/5 text-violet-200">
      {phase === "recording" ? <span aria-hidden="true" className="size-5 rounded-full bg-rose-500 motion-safe:animate-pulse" /> : <Smartphone size={38} strokeWidth={1.5} aria-hidden="true" />}
    </div>}
    <p role="status" className={capture ? "text-sm font-semibold text-slate-800" : "flex items-center gap-2.5 text-base font-medium text-slate-100 sm:text-lg"}>
      {!capture && !connected && <span aria-hidden="true" className={waitingDot} />}{note}
    </p>
    {phase === "waiting" && code && <div className="space-y-3 rounded-2xl bg-white p-5 text-center text-slate-700">
      {/* eslint-disable-next-line @next/next/no-img-element -- The QR is generated by the local bridge. */}
      <img src={code.qr} width={240} height={240} className="mx-auto rounded-xl" alt="QR code for the Web Camera app" />
      <p className="text-sm text-slate-600">Use the same Wi-Fi on both devices.</p>
      {pairing && pairing.codes.length > 1 && <label className="block text-xs text-slate-700">Laptop network <select value={addressIndex} onChange={event => setAddressIndex(Number(event.target.value))} className="ml-1 rounded-md border border-slate-300 bg-white p-1">
        {pairing.codes.map((item, index) => <option key={item.address} value={index}>{item.name} · {item.address}</option>)}
      </select></label>}
    </div>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    {capture?.kind === "photo" && <ClaimPhonePhotoReview key={capture.take} photo={capture} locked={acting || disabled}
      attached={attachedTake === capture.take} destination={photoTarget} onFinish={finish} />}
    {capture?.kind === "video" && <ClaimPhoneTakeReview key={capture.take} video={capture} busy={acting || disabled} attached={attachedTake === capture.take}
      canTrim={!!pairing && status?.phase === "received" && status.take === capture.take}
      onTrim={async (start, end) => {
        if (!pairing) throw new Error("Reconnect the camera bridge to trim this recording.");
        const range = new URLSearchParams({ start: start.toFixed(3), end: end.toFixed(3) });
        return (await request(`/session/${pairing.id}/trim?${range}`, "POST", pairing, capture.take)).blob();
      }} onFinish={finish} />}
    {!capture && <div className="flex flex-wrap justify-center gap-2.5">
      {phase === "ready" && <>
        {!photoTarget && <button type="button" className={primary} disabled={acting || disabled} onClick={() => void send("start")}><Video size={18} aria-hidden="true" /> Start recording</button>}
        <button type="button" className={photoTarget ? primary : secondary} disabled={acting || disabled} onClick={() => void send("photo")}><Camera size={18} aria-hidden="true" /> Take photo</button>
      </>}
      {phase === "recording" && <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60" disabled={acting} onClick={() => void send("stop")}><Square size={16} fill="currentColor" aria-hidden="true" /> Stop recording</button>}
      {(phase === "ready" || phase === "recording") && typeof status?.torch === "boolean" && <button type="button"
        className={status.torch ? primary : secondary} aria-pressed={status.torch} disabled={disabled || acting || changingTorch}
        onClick={() => void toggleTorch()}><Flashlight size={18} aria-hidden="true" /> Flashlight</button>}
      {!pairing && !acting && <button type="button" className={primary} disabled={disabled} onClick={() => void connect()}>Show pairing QR</button>}
    </div>}
    {!capture && pairing && !working && phase !== "received" && <button type="button" disabled={acting || disabled} className="min-h-10 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
      onClick={() => void disconnect()}>{phase === "waiting" ? "Cancel pairing" : "Disconnect phone"}</button>}
    </div>
  </ClaimCameraDialog>}</>;
}
