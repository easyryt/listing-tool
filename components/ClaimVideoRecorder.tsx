"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, Square, Video } from "lucide-react";
import { captureClaimVideo, CLAIM_RECORDING_TYPE } from "@/lib/claim-video-capture";
import ClaimCameraDialog from "./ClaimCameraDialog";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50";
const cameraButton = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const recordButton = `${button} bg-violet-700 text-white hover:bg-violet-800`;

type CameraSession = { stream?: MediaStream; recording?: ReturnType<typeof captureClaimVideo>; stopping?: boolean };
type CameraPhase = "closed" | "opening" | "preview" | "recording" | "finishing" | "review" | "error";

function releaseCamera(session: CameraSession | null) {
  session?.recording?.cancel();
  session?.stream?.getTracks().forEach(track => track.stop());
}

function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (["NotAllowedError", "SecurityError"].includes(name)) return "Allow camera access in Chrome, then try again.";
  if (["NotFoundError", "OverconstrainedError"].includes(name)) return "Connect your phone as a webcam in Windows or over USB, then try again.";
  if (name === "NotReadableError") return "The camera is busy or disconnected. Close any other app using it, then try again.";
  return "Couldn’t open the camera. Reconnect it and try again, or add an MP4 file.";
}

export default function ClaimVideoRecorder({ disabled, onOpenChange, onUse }: {
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (file: File) => Promise<boolean>;
}) {
  const session = useRef<CameraSession | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<CameraPhase>("closed");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [recording, setRecording] = useState<{ file: File; url: string } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => () => { const active = session.current; session.current = null; releaseCamera(active); }, []);
  useEffect(() => {
    const video = preview.current;
    if (video) video.srcObject = stream;
    return () => { if (video) video.srcObject = null; };
  }, [stream]);
  useEffect(() => () => { if (recording) URL.revokeObjectURL(recording.url); }, [recording]);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  const clearCamera = () => {
    const active = session.current;
    session.current = null;
    releaseCamera(active);
    setStream(null);
    setCameraReady(false);
  };

  const fail = (message: string) => {
    clearCamera();
    setError(message);
    setPhase("error");
  };

  const openCamera = async (deviceId = "") => {
    clearCamera();
    setRecording(null);
    setError("");
    onOpenChange(true);
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia || typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(CLAIM_RECORDING_TYPE)) {
      fail("MP4 recording is unavailable in this browser. Open the tool in Chrome on HTTPS or localhost, or add an MP4 file.");
      return;
    }
    setPhase("opening");
    const active: CameraSession = {};
    session.current = active;
    try {
      const next = await media.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }) },
        audio: false,
      });
      active.stream = next;
      if (session.current !== active) { releaseCamera(active); return; }
      const track = next.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (session.current === active && !active.stopping) fail("Camera disconnected. Reconnect it and record a new continuous take.");
      }, { once: true });
      setDevice(track.getSettings().deviceId || deviceId);
      setStream(next);
      setPhase("preview");
      const devices = await media.enumerateDevices().catch(() => []);
      if (session.current === active) setCameras(devices.filter(item => item.kind === "videoinput" && item.deviceId));
    } catch (reason) {
      if (session.current === active) fail(cameraError(reason));
    }
  };

  const start = () => {
    const active = session.current;
    if (!active?.stream || active.recording || !cameraReady) return;
    try {
      active.recording = captureClaimVideo(active.stream, file => {
        if (session.current !== active) return;
        setRecording({ file, url: URL.createObjectURL(file) });
        clearCamera();
        setPhase("review");
      }, error => { if (session.current === active) fail(error); });
      setElapsed(0);
      setStartedAt(Date.now());
      setPhase("recording");
    } catch {
      fail("Couldn’t start MP4 recording. Try another camera or add an MP4 file.");
    }
  };

  const stop = () => {
    const active = session.current;
    if (!active?.recording?.stop()) return;
    active.stopping = true;
    setPhase("finishing");
  };

  const close = () => {
    clearCamera();
    setRecording(null);
    setPhase("closed");
    onOpenChange(false);
  };

  if (phase === "closed") return <button type="button" disabled={disabled} className={`${cameraButton} mt-2 w-full`} onClick={() => void openCamera(device)}><Video size={17} aria-hidden="true" /> Record video</button>;

  const live = phase === "preview" || phase === "recording" || phase === "finishing";
  const timer = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return <ClaimCameraDialog title="Record video" closeDisabled={phase === "recording" || phase === "finishing" || (phase === "review" && disabled)} onClose={close}>
    <div className="space-y-4 rounded-2xl bg-white p-3.5 text-slate-900 sm:p-5" aria-label="Unboxing video recorder">
    {phase === "opening" && <p role="status" className="text-sm text-slate-700">Opening camera…</p>}
    {live && <div className="relative">
      <video ref={preview} autoPlay muted playsInline aria-label="Live camera preview" onPlaying={() => setCameraReady(true)} className="mx-auto block h-[min(62dvh,720px)] w-full rounded-xl bg-slate-950 object-contain" />
      {phase === "recording" && <div role="status" aria-label="Recording" className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1.5 text-sm font-semibold text-white shadow">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-rose-500 motion-safe:animate-pulse" /><time className="tabular-nums">{timer}</time>
      </div>}
    </div>}
    {phase === "preview" && <>
      {cameras.length > 0 && <label className="block text-xs font-semibold text-slate-700">Camera
        <select value={device} onChange={event => void openCamera(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
          {!cameras.some(camera => camera.deviceId === device) && <option value={device}>Current camera</option>}
          {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
        </select>
      </label>}
      <p className="text-xs text-slate-600">Connect your phone as a webcam and select it here. Check that the parcel label is readable.</p>
    </>}
    {phase === "finishing" && <p role="status" className="text-sm text-slate-700">Finishing MP4…</p>}
    {phase === "review" && recording && <video src={recording.url} controls playsInline preload="metadata" aria-label="Review captured video" className="mx-auto block h-[min(62dvh,720px)] w-full rounded-xl bg-slate-950 object-contain" />}
    {phase === "error" && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {phase === "preview" && <button type="button" className={recordButton} disabled={!cameraReady} onClick={start}><Circle size={15} aria-hidden="true" /> Start recording</button>}
      {phase === "recording" && <button type="button" className={recordButton} onClick={stop}><Square size={15} aria-hidden="true" /> Stop recording</button>}
      {phase === "review" && recording && <>
        <button type="button" disabled={disabled} className={recordButton} onClick={async () => { if (await onUse(recording.file)) close(); }}><Check size={15} aria-hidden="true" /> Use recording</button>
        <button type="button" disabled={disabled} className={cameraButton} onClick={() => void openCamera(device)}>Record again</button>
      </>}
      {phase === "error" && <button type="button" className={cameraButton} onClick={() => void openCamera()}>Try camera again</button>}
      {phase !== "recording" && phase !== "finishing" && <button type="button" disabled={disabled} className={cameraButton} onClick={close}>Cancel</button>}
    </div>
    </div>
  </ClaimCameraDialog>;
}
