"use client";

import { isMeeshoPanel, matchingMeeshoReceipt, meeshoTargetKey, validMeeshoTarget, type MeeshoReceipt, type MeeshoTarget } from "./meesho-upload-contract";
import { validateProductImageFiles, type ProductImageSelection, type ProductImageSetJob, type ProductImageValues } from "./meesho-image-set";

export type MeeshoUpload = {
  id: string; target: MeeshoTarget; originalName: string; initialValue: string;
  filename: string; sha256: string; progress: number; message: string;
  phase: "queued" | "running" | "error" | "ready" | "applied"; receipt?: MeeshoReceipt;
  canResume?: boolean; superseded?: boolean;
};
type Job = { id: string; phase: string; error?: string; staged?: boolean; uploadAttempted?: boolean; record?: MeeshoReceipt };
type StagedImage = { id: string; filename: string; originalName: string; token: string; sha256: string; target: MeeshoTarget; type: string; bytes: number; mode?: "browser" };
type Reply = { ok: boolean; requestId?: string; id?: string; extensionId?: string; version?: string; listingUpload?: boolean; singleTabUploads?: boolean; sellerAccountDetection?: boolean; routedReplies?: boolean; browserStaging?: boolean; downloadFreeUploads?: boolean; sourceUrl?: string; staged?: StagedImage; job?: Job; error?: string };
type ExtensionState = { phase: "checking" } | { phase: "connected"; version?: string } | { phase: "unavailable"; message: string };
const uploads = new Map<string, MeeshoUpload>(), listeners = new Set<() => void>();
const calls = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; replies?: Reply[]; extensionId?: string }>();
const initialExtensionState: ExtensionState = { phase: "checking" };
const extensionListeners = new Set<() => void>();
let extensionState: ExtensionState = initialExtensionState;
let discovery: Promise<Reply> | undefined;
let listening = false, restored = false, chain: Promise<unknown> = Promise.resolve();
let revision = 0;
const storageKey = "listing-meesho-pending-v1";
function persist() { try { sessionStorage.setItem(storageKey, JSON.stringify([...uploads.values()].filter(j => j.phase !== "applied").map(j => ({ ...j, phase: j.phase === "ready" ? "ready" : "error", canResume: !!j.filename, message: j.phase === "ready" ? j.message : "Check this saved upload before starting another copy." })))); } catch { /* The extension also retains submitted jobs. */ } }
function put(job: MeeshoUpload) { uploads.set(meeshoTargetKey(job.target), { ...job }); revision++; persist(); listeners.forEach(fn => fn()); }
function initialize() {
  if (typeof window === "undefined") return;
  if (!restored) { restored = true; try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); for (const j of saved) if (j?.id && j?.target && typeof j.filename === "string") uploads.set(meeshoTargetKey(j.target), j); revision++; } catch {} }
  if (listening) return; listening = true;
  document.addEventListener("listing-meesho-response", ((event: CustomEvent<string>) => {
    if (typeof event.detail !== "string") return; let reply: Reply; try { reply = JSON.parse(event.detail); } catch { return; }
    const pending = calls.get(reply.requestId || ""); if (!pending) return;
    if (pending.replies) { pending.replies.push(reply); return; }
    if (pending.extensionId && reply.extensionId !== pending.extensionId) return;
    clearTimeout(pending.timer); calls.delete(reply.requestId!); if (reply.ok) pending.resolve(reply); else pending.reject(new Error(reply.error || "Meesho upload failed."));
  }) as EventListener);
}
export function subscribeMeesho(fn: () => void) { initialize(); listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getMeeshoUpload(target: MeeshoTarget) { return uploads.get(meeshoTargetKey(target)) || null; }
export function getMeeshoUploadRevision() { return revision; }
function request(type: string, data: object = {}, timeout = 12000, extensionId?: string): Promise<Reply> {
  initialize(); const requestId = crypto.randomUUID(); return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      calls.delete(requestId);
      reconnectExtension();
      reject(new Error("Chrome lost the extension connection. Check the connection before retrying this upload."));
    }, timeout);
    calls.set(requestId, { resolve, reject, timer, extensionId });
    const channel = extensionId ? "listing-meesho-routed-request" : "listing-meesho-request";
    document.dispatchEvent(new CustomEvent(channel, { detail: JSON.stringify({ requestId, type, ...data, extensionId }) }));
  });
}
async function discoverExtension() {
  initialize();
  const requestId = crypto.randomUUID(), replies: Reply[] = [];
  const installed = () => replies.filter(reply => reply.ok && /^[a-p]{32}$/.test(reply.id || ""));
  const detail = JSON.stringify({ requestId, type: "listing-meesho-hello" });
  await new Promise<void>(resolve => {
    let attempts = 0;
    const probe = () => {
      if (attempts === 4 || installed().length) {
        calls.delete(requestId);
        resolve();
        return;
      }
      attempts++;
      const timer = setTimeout(probe, 1000);
      calls.set(requestId, { resolve: () => {}, reject: () => {}, timer, replies });
      document.dispatchEvent(new CustomEvent("listing-meesho-request", { detail }));
    };
    probe();
  });
  const copies = [...new Map(installed().map(reply => [reply.id, reply])).values()];
  if (copies.length > 1) throw new Error("Keep one Browser AI Test extension enabled, then refresh. Multiple copies could upload duplicates.");
  if (!copies.length) {
    const connectionError = replies.find(reply => reply.ok === false && typeof reply.error === "string")?.error;
    throw new Error(connectionError || `Browser AI Test did not respond. In this Chrome profile, allow version 0.12.0 or newer to run on ${location.origin}, then refresh this page and try again.`);
  }
  if (!copies[0].listingUpload) throw new Error("Update Browser AI Test to 0.12.0 or newer and refresh this page to enable Meesho uploads.");
  if (!copies[0].downloadFreeUploads || !copies[0].browserStaging) throw new Error("Upload without a downloaded copy requires Browser AI Test 0.10.0. Reload the extension and refresh this page. No image has uploaded or downloaded.");
  if (!copies[0].sellerAccountDetection) throw new Error("Seller account selection requires Browser AI Test 0.12.0. Update the extension and refresh this page.");
  return copies[0];
}
function setExtensionState(state: ExtensionState) {
  extensionState = state;
  extensionListeners.forEach(listener => listener());
}
async function connectedExtension(requireSingleTab = false) {
  if (!discovery) {
    discovery = discoverExtension().then(reply => {
      setExtensionState({ phase: "connected", version: reply.version });
      return reply;
    }, (error: Error) => {
      setExtensionState({ phase: "unavailable", message: error.message });
      throw error;
    }).finally(() => { discovery = undefined; });
    if (extensionState.phase === "unavailable") setExtensionState(initialExtensionState);
  }
  const reply = await discovery;
  if (requireSingleTab && !reply.singleTabUploads) throw new Error("Reload Browser AI Test to 0.10.0, then refresh the listing page to use one Meesho tab for bulk uploads. No image has uploaded.");
  return reply;
}
export async function checkMeeshoExtension(requireSingleTab = false) { return (await connectedExtension(requireSingleTab)).version; }
export function getMeeshoExtensionState() { return extensionState; }
export function getInitialMeeshoExtensionState() { return initialExtensionState; }
function reconnectExtension() { if (!document.hidden) void connectedExtension().catch(() => {}); }
function onBridgeReady() {
  if (!document.hidden) void connectedExtension().catch(reconnectExtension);
}
export function subscribeMeeshoExtension(listener: () => void) {
  extensionListeners.add(listener);
  if (extensionListeners.size === 1) {
    window.addEventListener("focus", reconnectExtension);
    document.addEventListener("visibilitychange", reconnectExtension);
    document.addEventListener("listing-meesho-bridge-ready", onBridgeReady);
    reconnectExtension();
  }
  return () => {
    extensionListeners.delete(listener);
    if (!extensionListeners.size) {
      window.removeEventListener("focus", reconnectExtension);
      document.removeEventListener("visibilitychange", reconnectExtension);
      document.removeEventListener("listing-meesho-bridge-ready", onBridgeReady);
    }
  };
}
export function savedMeeshoPanel() { try { const value = localStorage.getItem("listing-meesho-panel") || ""; return isMeeshoPanel(value) ? new URL(value).href : ""; } catch { return ""; } }
export function saveMeeshoPanel(value: string) {
  if (!value) { localStorage.removeItem("listing-meesho-panel"); return; }
  if (!isMeeshoPanel(value)) throw new Error("Use the address of your Meesho Image Bulk Upload page.");
  localStorage.setItem("listing-meesho-panel", new URL(value).href);
}
function selectMeeshoDestination() {
  const configured = savedMeeshoPanel();
  let detected: Promise<string> | undefined;
  return (extensionId?: string) => configured ? Promise.resolve(configured) : detected ??= request("listing-meesho-account", {}, undefined, extensionId).then(reply => {
    if (!reply.sourceUrl || !isMeeshoPanel(reply.sourceUrl)) throw new Error("Open your seller’s Image Bulk Upload page in Chrome and try again.");
    return reply.sourceUrl;
  });
}
function jobProgress(current: MeeshoUpload, job: Job) {
  if (current.phase === "applied") return;
  const milestones: Record<string, [number, string]> = { "opening-meesho": [25, "Opening Meesho…"], "uploading-image": [40, "Supplying this image to Meesho…"], "finding-file": [65, "Waiting for Meesho to confirm this image’s link…"], "saving-local": [85, "Image verified. Saving its link…"], "copying-link": [90, "Copying the verified image link…"] };
  if (job.phase === "complete" && job.record) {
    if (!matchingMeeshoReceipt(job.record, current)) throw new Error("The returned image does not match this product and image slot. Its link was not pasted.");
    put({ ...current, phase: "ready", progress: 95, message: "Applying the verified link to this image field…", receipt: job.record, canResume: true });
    return;
  }
  if (job.error) { put({ ...current, phase: "error", message: job.error, canResume: !!job.staged || !!job.uploadAttempted }); return; }
  const stage = milestones[job.phase]; if (stage) put({ ...current, progress: Math.max(current.progress, stage[0]), message: stage[1], phase: "running" });
}
async function follow(current: MeeshoUpload, extensionId: string | undefined, action: () => Promise<Reply>) {
  let polling = false;
  const status = () => request("listing-meesho-status", { jobId: current.id }, undefined, extensionId);
  const timer = setInterval(async () => { if (polling) return; polling = true; try { const r = await status(); const latest = getMeeshoUpload(current.target); if (r.job && latest?.id === current.id) jobProgress(latest, r.job); } catch {} finally { polling = false; } }, 900);
  try { const result = await action(); if (!result.job) throw new Error("Meesho did not confirm this upload."); const latest = getMeeshoUpload(current.target); if (latest?.id === current.id) jobProgress(latest, result.job); }
  catch (error) {
    const latest = getMeeshoUpload(current.target); if (latest?.id !== current.id || latest.phase === "applied") return;
    let recoverable = false; try { const saved = await status(); recoverable = !!saved.job?.staged || !!saved.job?.uploadAttempted; } catch {}
    put({ ...latest, phase: "error", message: error instanceof Error ? error.message : "Upload failed.", canResume: recoverable });
  }
  finally { clearInterval(timer); }
}
function queue(action: () => Promise<void>) { chain = chain.catch(() => {}).then(action); return chain; }
export function startMeeshoUpload(file: File, target: MeeshoTarget, initialValue: string, singleTab = false) {
  return queueMeeshoUpload(file, target, initialValue, selectMeeshoDestination(), singleTab);
}
function queueMeeshoUpload(file: File, target: MeeshoTarget, initialValue: string, destination: (extensionId?: string) => Promise<string>, singleTab: boolean) {
  initialize(); const previous = getMeeshoUpload(target);
  if (previous && ["queued", "running"].includes(previous.phase)) return Promise.resolve();
  if (!["image/png", "image/jpeg"].includes(file.type) || !file.size || file.size > 4194304) throw new Error("Choose one PNG or JPG up to 4 MB.");
  if (!validMeeshoTarget(target)) throw new Error("Invalid product image destination.");
  const current: MeeshoUpload = { id: crypto.randomUUID(), target, initialValue, originalName: file.name, filename: "", sha256: "", progress: 0, phase: "queued", message: "Queued — each image uploads separately." };
  put(current);
  return queue(async () => {
    try {
      const extension = await connectedExtension(singleTab);
      const extensionId = extension.routedReplies ? extension.id : undefined;
      const sourceUrl = await destination(extensionId);
      put({ ...current, ...getMeeshoUpload(target), phase: "running", progress: 10, message: "Preparing this selected image…" });
      const bytes = await file.arrayBuffer(), digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Could not read the image.")); reader.readAsDataURL(file); });
      const selectedFile = { name: file.name, type: file.type, base64 };
      put({ ...current, ...getMeeshoUpload(target), phase: "running", progress: 10, message: "Preparing the selected image in browser memory…" });
      const prepared = await request("listing-meesho-prepare", { jobId: current.id, target, sha256, file: selectedFile }, 65000, extensionId);
      if (!prepared.staged || prepared.staged.mode !== "browser") throw new Error("Chrome did not confirm preparing this selected image.");
      const staged = prepared.staged;
      if (staged.sha256 !== sha256 || !validMeeshoTarget(staged.target) || meeshoTargetKey(staged.target) !== meeshoTargetKey(target) || staged.id !== current.id || staged.bytes !== file.size || staged.type !== file.type) throw new Error("The prepared image does not match its destination.");
      Object.assign(current, getMeeshoUpload(target), { filename: staged.filename, sha256, progress: 20, phase: "running" }); put(current);
      await follow(current, extensionId, () => request("listing-meesho-start", { jobId: current.id, sourceUrl, listing: { origin: location.origin, ...(staged.mode === "browser" ? { mode: "browser" } : {}), token: staged.token, sha256, target, filename: staged.filename, bytes: file.size, originalName: staged.originalName, type: file.type } }, 170000, extensionId));
    } catch (error) { put({ ...(getMeeshoUpload(target) || current), phase: "error", message: error instanceof Error ? error.message : "Could not upload this image." }); }
  });
}
export function resumeMeeshoUpload(target: MeeshoTarget) {
  const current = getMeeshoUpload(target); if (!current) return Promise.resolve();
  const sourceUrl = savedMeeshoPanel();
  put({ ...current, phase: "queued", message: "Queued to check the original upload…" });
  return queue(async () => {
    try {
      const extension = await connectedExtension();
      const extensionId = extension.routedReplies ? extension.id : undefined;
      await follow(current, extensionId, () => request("listing-meesho-resume", { jobId: current.id, sourceUrl }, 150000, extensionId));
    } catch (error) { put({ ...current, phase: "error", message: error instanceof Error ? error.message : "Could not reconnect." }); }
  });
}
export function markMeeshoApplied(target: MeeshoTarget, id: string) { const j = getMeeshoUpload(target); if (j?.id === id && j.receipt) put({ ...j, phase: "applied", progress: 100, message: "100% · Uploaded and linked to this image." }); }
export function invalidateMeeshoSelection(target: MeeshoTarget) { const j = getMeeshoUpload(target); if (j && j.phase !== "applied") put({ ...j, superseded: true }); }
export function startMeeshoImageSet(rowId: string, selections: readonly ProductImageSelection[], values: ProductImageValues) {
  initialize();
  validateProductImageFiles(selections.map(s => s.file));
  const fields = new Set<string>();
  for (const selection of selections) {
    if (!["image1", "image2", "image3", "image4"].includes(selection.field) || fields.has(selection.field)) throw new Error("Each image needs a different image slot.");
    fields.add(selection.field);
    const existing = getMeeshoUpload({ rowId, field: selection.field });
    if (existing && ["queued", "running", "ready"].includes(existing.phase)) throw new Error(`Image ${selection.field.slice(-1)} already has a pending upload. Finish or resolve it first. No new images were queued.`);
  }
  const jobs: ProductImageSetJob[] = [], promises: Promise<unknown>[] = [];
  const destination = selectMeeshoDestination();
  for (const selection of selections) {
    const target = { rowId, field: selection.field };
    promises.push(queueMeeshoUpload(selection.file, target, values[selection.field], destination, true));
    jobs.push({ id: getMeeshoUpload(target)!.id, field: selection.field, name: selection.file.name });
  }
  return { jobs, finished: Promise.all(promises).then(() => {}) };
}
export function startMeeshoImageBatch(selections: readonly {file:File;target:MeeshoTarget;initialValue:string}[]) {
  initialize();validateProductImageFiles(selections.map(s=>s.file),50);
  const used=new Set<string>();
  for(const s of selections){const key=meeshoTargetKey(s.target);if(!validMeeshoTarget(s.target)||used.has(key))throw new Error("Each variant image needs a valid, unique destination.");used.add(key);const old=getMeeshoUpload(s.target);if(old&&["queued","running","ready"].includes(old.phase))throw new Error("A selected variant already has a pending image upload. No new images were queued.");}
  const jobs: {id:string;target:MeeshoTarget;name:string}[]=[],promises:Promise<unknown>[]=[];
  const destination=selectMeeshoDestination();
  for(const s of selections){promises.push(queueMeeshoUpload(s.file,s.target,s.initialValue,destination,true));jobs.push({id:getMeeshoUpload(s.target)!.id,target:s.target,name:s.file.name});}
  return {jobs,finished:Promise.all(promises).then(()=>{})};
}
