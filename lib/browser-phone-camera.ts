import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "./meesho-claims";

export const cameraChannel = "claims-camera-v1";
export const cameraChunkBytes = 16_384;
export const cameraLimits = { video: MAX_VIDEO_BYTES, photo: MAX_PHOTO_BYTES };
export type CameraKind = keyof typeof cameraLimits;
export type CameraCommand = "start" | "stop" | "photo" | "torch" | "review" | "accepted";
export type CameraNotice =
  | { type: "ready"; mp4: boolean; torch: boolean }
  | { type: "recording" }
  | { type: "torch"; enabled: boolean }
  | { type: "error"; message: string }
  | { type: "file"; kind: CameraKind; bytes: number }
  | { type: "end" };

export async function pairRequest<T>(action: string, fields: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch("/api/phone-camera/pair", {
    method: "POST", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...fields }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || "Unable to pair the phone camera.");
  return value;
}

export async function localCameraSdp(peer: RTCPeerConnection, type: "offer" | "answer") {
  await peer.setLocalDescription(type === "offer" ? await peer.createOffer() : await peer.createAnswer());
  if (peer.iceGatheringState !== "complete") await new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); resolve(); };
    const changed = () => { if (peer.iceGatheringState === "complete") finish(); };
    const timer = setTimeout(finish, 6000);
    peer.addEventListener("icegatheringstatechange", changed);
    changed();
  });
  const sdp = peer.localDescription?.sdp;
  if (!sdp?.includes("\r\na=candidate:")) throw new Error("No camera connection was found. Connect both devices to the same Wi-Fi and try again.");
  return sdp;
}

export async function sendCameraFile(channel: RTCDataChannel, file: Blob, kind: CameraKind) {
  if (!file.size || file.size > cameraLimits[kind]) throw new Error(kind === "video" ? "Record a clip under 100 MB." : "Take a photo under 10 MB.");
  channel.send(JSON.stringify({ type: "file", kind, bytes: file.size } satisfies CameraNotice));
  channel.bufferedAmountLowThreshold = 128 * 1024;
  for (let offset = 0; offset < file.size; offset += cameraChunkBytes) {
    if (channel.bufferedAmount > 512 * 1024) await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        channel.removeEventListener("bufferedamountlow", resume);
        channel.removeEventListener("close", stopped);
        if (error) reject(error); else resolve();
      };
      const resume = () => finish();
      const stopped = () => finish(new Error("The laptop disconnected during transfer."));
      const timer = setTimeout(() => finish(new Error("The transfer stalled. Move both devices closer to Wi-Fi and reconnect.")), 15_000);
      channel.addEventListener("bufferedamountlow", resume);
      channel.addEventListener("close", stopped);
      if (channel.readyState !== "open") stopped();
      else if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) resume();
    });
    channel.send(await file.slice(offset, offset + cameraChunkBytes).arrayBuffer());
  }
  channel.send(JSON.stringify({ type: "end" } satisfies CameraNotice));
}
