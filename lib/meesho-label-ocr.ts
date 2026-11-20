"use client";

import { extractClaimIdentifiers, type ClaimLabelReading } from "./meesho-label-reader";
import type { Worker } from "tesseract.js";

export type LabelScanProgress = { percent: number; message: string };

export function labelPhotoProblem(file: Pick<File, "size" | "type">) {
  if (!file.size) return "Choose a non-empty label photo.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Choose a PNG, JPG or WebP label photo.";
  if (file.size > 10 * 1024 * 1024) return "Choose a label photo up to 10 MB.";
  return "";
}

const barcodeModuleOverrides = { locateFile: () => "/claims-ocr/zxing_reader.wasm" };

async function decodeBarcodes(file: File, signal: AbortSignal) {
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  let pixels: ImageData;
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return [];
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  prepareZXingModule({ overrides: barcodeModuleOverrides });
  const results = await readBarcodes(pixels, { tryHarder: true, maxNumberOfSymbols: 8 });
  return results.filter(result => result.isValid).map(result => result.text);
}

export async function readClaimLabel(file: File, onProgress: (progress: LabelScanProgress) => void, signal: AbortSignal): Promise<ClaimLabelReading> {
  const problem = labelPhotoProblem(file);
  if (problem) throw new Error(problem);
  signal.throwIfAborted();
  const assetPath = new URL("/claims-ocr/", window.location.origin).href;
  let worker: Worker | undefined;
  let barcodes: string[] = [];
  let closed = false;
  let rejectJob: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectJob = reject; });
  const stopWorker = async () => { const active = worker; worker = undefined; await active?.terminate(); };
  const cancel = () => { rejectJob(new DOMException("Label reading cancelled.", "AbortError")); void stopWorker(); };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => rejectJob(new Error("Reading took too long. Try a clear, close-up photo of the shipping label.")), 60000);
  const recognize = async () => {
    onProgress({ percent: 3, message: "Reading barcodes and QR codes…" });
    barcodes = await decodeBarcodes(file, signal).catch(() => []);
    signal.throwIfAborted();
    if (closed) return extractClaimIdentifiers("", 0, barcodes);
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    signal.throwIfAborted();
    if (closed) return extractClaimIdentifiers("", 0, barcodes);
    const active = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: assetPath + "worker.min.js",
      corePath: assetPath,
      langPath: assetPath.replace(/\/$/, ""),
      cachePath: "claims-eng-best-int-v1",
      workerBlobURL: false,
      logger: message => {
        if (signal.aborted || closed) return;
        onProgress(message.status === "recognizing text"
          ? { percent: 30 + Math.round(message.progress * 65), message: "Reading numbers from the photo…" }
          : { percent: 8 + Math.round(message.progress * 20), message: "Preparing the label reader…" });
      },
      errorHandler: () => rejectJob(new Error("The label reader could not start. Refresh and try again.")),
    });
    if (closed || signal.aborted) { await active.terminate(); throw new DOMException("Label reading cancelled.", "AbortError"); }
    worker = active;
    await active.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const result = await active.recognize(file, { rotateAuto: true });
    signal.throwIfAborted();
    return extractClaimIdentifiers(result.data.text, result.data.confidence, barcodes);
  };
  try { return await Promise.race([recognize(), stopped]); }
  catch (error) {
    signal.throwIfAborted();
    const decodedOnly = extractClaimIdentifiers("", 0, barcodes);
    if (decodedOnly.barcodeValues.length) return decodedOnly;
    throw error;
  }
  finally { closed = true; clearTimeout(timeout); signal.removeEventListener("abort", cancel); await stopWorker(); }
}
