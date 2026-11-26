"use client";

import { useEffect, useRef, useState } from "react";

export const cameraControl = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50";
export const cameraSecondary = `${cameraControl} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
export const cameraPrimary = `${cameraControl} bg-violet-700 text-white hover:bg-violet-800`;

export type ReviewedVideo = { take: string; file: File; url: string };

function clock(seconds: number) {
  const tenths = Math.floor(seconds * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}

export default function ClaimPhoneTakeReview({ video, busy, canTrim, attached, onTrim, onFinish }: {
  video: ReviewedVideo;
  busy: boolean;
  canTrim: boolean;
  attached: boolean;
  onTrim?: (start: number, end: number) => Promise<Blob>;
  onFinish: (file?: File) => Promise<void>;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const playUntil = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [editing, setEditing] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [trimmed, setTrimmed] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (trimmed) URL.revokeObjectURL(trimmed.url); }, [trimmed]);

  const locked = busy || trimming;
  const seek = (time: number) => {
    playUntil.current = null;
    if (!player.current) return;
    player.current.pause();
    player.current.currentTime = time;
  };
  const applyTrim = async () => {
    if (!onTrim) return;
    setTrimming(true);
    setError("");
    try {
      const blob = await onTrim(start, end);
      const file = new File([blob], video.file.name.replace(/\.mp4$/, "-trimmed.mp4"), { type: "video/mp4" });
      setTrimmed({ file, url: URL.createObjectURL(file) });
      setEditing(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setTrimming(false); }
  };

  return <div className="space-y-3">
    <video ref={player} key={trimmed?.url || video.url} src={trimmed?.url || video.url} controls playsInline preload="metadata"
      aria-label={trimmed ? "Trimmed recording preview" : "Phone recording preview"}
      className="mx-auto block h-[min(58dvh,660px)] w-full rounded-xl bg-slate-950 object-contain"
      onLoadedMetadata={event => {
        const seconds = event.currentTarget.duration;
        if (!trimmed && Number.isFinite(seconds) && !duration) { setDuration(seconds); setEnd(seconds); }
      }}
      onTimeUpdate={event => {
        const media = event.currentTarget;
        if (playUntil.current !== null && media.currentTime >= playUntil.current) {
          media.pause();
          media.currentTime = playUntil.current;
          playUntil.current = null;
        }
      }} />
    {trimmed && <p role="status" className="text-sm font-medium text-slate-700">Previewing the trimmed clip. You can still use the original.</p>}
    {editing && <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <label className="block text-sm text-slate-800">Start <span className="float-right tabular-nums">{clock(start)}</span>
        <input aria-label="Trim start" type="range" className="block w-full accent-violet-700" min={0} max={duration} step={0.01} value={start}
          disabled={locked} onChange={event => { const next = Math.min(Number(event.target.value), end - 0.1); setStart(next); seek(next); }} />
      </label>
      <label className="block text-sm text-slate-800">End <span className="float-right tabular-nums">{clock(end)}</span>
        <input aria-label="Trim end" type="range" className="block w-full accent-violet-700" min={0} max={duration} step={0.01} value={end}
          disabled={locked} onChange={event => { const next = Math.max(Number(event.target.value), start + 0.1); setEnd(next); seek(next); }} />
      </label>
      <p className="text-xs leading-5 text-slate-600">Meesho recommends one continuous, unedited video. The original stays available while you review.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cameraSecondary} disabled={locked} onClick={() => {
          if (!player.current) return;
          player.current.currentTime = start;
          playUntil.current = end;
          void player.current.play().catch(() => {});
        }}>Play selection</button>
        <button type="button" className={cameraPrimary} disabled={locked || !canTrim || (start === 0 && end === duration)} onClick={() => void applyTrim()}>{trimming ? "Trimming…" : "Apply trim"}</button>
        <button type="button" className={cameraSecondary} disabled={locked} onClick={() => { seek(0); setEditing(false); setError(""); }}>Cancel trim</button>
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {!attached && <>
        <button type="button" className={cameraPrimary} disabled={locked} onClick={() => void onFinish(trimmed?.file || video.file)}>{trimmed ? "Use trimmed clip" : "Use recording"}</button>
        {trimmed && <button type="button" className={cameraSecondary} disabled={locked} onClick={() => void onFinish(video.file)}>Use original</button>}
        {!editing && duration > 0.1 && canTrim && <button type="button" className={cameraSecondary} disabled={locked} onClick={() => { setTrimmed(null); setEditing(true); setError(""); }}>{trimmed ? "Adjust trim" : "Trim video"}</button>}
      </>}
      <button type="button" className={cameraSecondary} disabled={locked} onClick={() => void onFinish()}>{attached ? "Finish review" : "Discard take"}</button>
    </div>
  </div>;
}
