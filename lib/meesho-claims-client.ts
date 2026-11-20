"use client";

import { claimPayload, claimProblems, EVIDENCE_LABELS, type ClaimDraft } from "./meesho-claims";
import { readClaimEvidence } from "./meesho-claims-store";
export type ClaimPreparation = { operationId: string; draftId: string; revision: number; phase: "prepared" | "review"; supplied: string[]; submitted: false };
type Reply = { ok: boolean; error?: string; requestId?: string; id?: string; version?: string; claimsAutofill?: boolean; operationId?: string; result?: ClaimPreparation };
const pending = new Map<string, { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let listening = false;
function request(type: string, data: object = {}, timeout = 20000) {
  if (!listening) {
    listening = true;
    document.addEventListener("listing-claims-response", ((event: CustomEvent<string>) => {
      if (typeof event.detail !== "string") return;
      let reply: Reply; try { reply = JSON.parse(event.detail); } catch { return; }
      const call = pending.get(reply.requestId || ""); if (!call) return;
      clearTimeout(call.timer); pending.delete(reply.requestId!);
      if (reply.ok) call.resolve(reply); else call.reject(new Error(reply.error || "The claims extension could not finish this step."));
    }) as EventListener);
  }
  return new Promise<Reply>((resolve, reject) => {
    const requestId = crypto.randomUUID(), timer = setTimeout(() => { pending.delete(requestId); reject(new Error("The claims extension did not reply. Reload Browser AI Test 0.11.0 and refresh. Check the original Meesho form before starting another attempt.")); }, timeout);
    pending.set(requestId, { resolve, reject, timer });
    document.dispatchEvent(new CustomEvent("listing-claims-request", { detail: JSON.stringify({ type, requestId, ...data }) }));
  });
}
export async function checkClaimsExtension() {
  const requestId = crypto.randomUUID(), replies: Reply[] = [];
  const collect = ((event: CustomEvent<string>) => { if (typeof event.detail !== "string") return; try { const reply = JSON.parse(event.detail) as Reply; if (reply.requestId === requestId && reply.ok) replies.push(reply); } catch {} }) as EventListener;
  document.addEventListener("listing-claims-response", collect);
  try {
    document.dispatchEvent(new CustomEvent("listing-claims-request", { detail: JSON.stringify({ type: "claims-hello", requestId }) }));
    await new Promise(resolve => setTimeout(resolve, 800));
  } finally { document.removeEventListener("listing-claims-response", collect); }
  const copies = [...new Map(replies.filter(reply => /^[a-p]{32}$/.test(reply.id || "")).map(reply => [reply.id, reply])).values()];
  if (copies.length > 1) throw new Error("Keep one Browser AI Test extension enabled, then refresh. Multiple copies could prepare the same claim twice.");
  if (copies.length !== 1 || !copies[0].claimsAutofill) throw new Error("Update and reload Browser AI Test 0.11.0 for claims autofill, allow this listing site, then refresh.");
  return copies[0].version;
}
export async function prepareMeeshoClaim(draft: ClaimDraft, onProgress: (percent: number, message: string, operationId?: string) => void): Promise<ClaimPreparation> {
  const errors = claimProblems(draft); if (errors.length) throw new Error(errors[0]);
  await checkClaimsExtension();
  const payload = claimPayload(draft), operationId = crypto.randomUUID();
  onProgress(3, "Opening Meesho and preparing the claim form…", operationId);
  try {
  const opened = await request("claims-prepare", { operationId, claim: payload }, 90000);
  if (opened.operationId !== operationId) throw new Error("The extension returned a different claim operation.");
  const total = draft.evidence.reduce((sum, file) => sum + file.bytes, 0); let transferred = 0;
  for (const file of draft.evidence) {
    const blob = await readClaimEvidence(file.id);
    if (blob.size !== file.bytes || blob.type !== file.type) throw new Error("The saved evidence changed. Choose the original file again.");
    await request("claims-file-begin", { operationId, role: file.role });
    let index = 0;
    for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 512 * 1024).arrayBuffer());
      let binary = ""; for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
      await request("claims-file-chunk", { operationId, role: file.role, index: index++, base64: btoa(binary) });
      transferred += bytes.length; onProgress(10 + Math.round(transferred / total * 75), `Sending ${EVIDENCE_LABELS[file.role].toLowerCase()} to Meesho…`, operationId);
    }
    await request("claims-file-finish", { operationId, role: file.role }, 60000);
  }
  const finished = await request("claims-finish", { operationId }, 30000), result = finished.result;
  if (!result || result.operationId !== operationId || result.draftId !== draft.id || result.revision !== draft.revision || result.phase !== "review" || result.submitted !== false) throw new Error("The prepared form did not match this saved claim. Check Meesho before continuing.");
  onProgress(100, "Form filled. Review evidence uploads and submit the ticket in Meesho.", operationId);
  return result;
  } catch (error) {
    await request("claims-abort", { operationId }, 5000).catch(() => {});
    throw error;
  }
}
export function openPreparedClaim(operationId: string) { return request("claims-focus", { operationId }); }
