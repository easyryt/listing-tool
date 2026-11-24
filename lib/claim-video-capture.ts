import { MAX_VIDEO_BYTES } from "./meesho-claims";

export const CLAIM_RECORDING_TYPE = "video/mp4;codecs=avc1";
const interrupted = "Recording was interrupted. Reconnect the camera and record a new continuous take.";

export function captureClaimVideo(stream: MediaStream, onComplete: (file: File) => void, onError: (message: string) => void) {
  const recorder = new MediaRecorder(stream, { mimeType: CLAIM_RECORDING_TYPE, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  let bytes = 0;
  let stopping = false;
  let finished = false;

  const cancel = () => {
    finished = true;
    if (recorder.state !== "inactive") recorder.stop();
  };

  const fail = (message: string) => {
    if (finished) return;
    cancel();
    onError(message);
  };

  recorder.ondataavailable = ({ data }) => {
    if (finished || !data.size) return;
    bytes += data.size;
    if (bytes > MAX_VIDEO_BYTES) {
      fail("The recording exceeded 100 MB. Record a shorter continuous video, or add an MP4 file.");
      return;
    }
    chunks.push(data);
  };
  recorder.onerror = () => fail(interrupted);
  recorder.onstop = () => {
    if (finished) return;
    if (!bytes || !stopping) { fail(interrupted); return; }
    finished = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    onComplete(new File(chunks, `unboxing-${timestamp}.mp4`, { type: "video/mp4" }));
  };

  recorder.start(1000);
  return {
    stop() {
      if (recorder.state !== "recording") return false;
      stopping = true;
      recorder.stop();
      return true;
    },
    cancel,
  };
}
