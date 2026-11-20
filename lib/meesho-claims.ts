export const DEFAULT_CLAIMS_URL = "https://supplier.meesho.com/panel/v3/new/fulfillment/jifdb/claims";
export const CLAIM_ISSUES = {
  wrong_return: "I have received wrong return",
  damaged_return: "I have received damaged return",
  missing_items: "Item/s are missing in my return",
  used_return: "I have received used product as return",
} as const;
export type ClaimIssue = keyof typeof CLAIM_ISSUES;
export const EVIDENCE_ROLES = ["video", "product", "waybill", "barcode"] as const;
export type EvidenceRole = typeof EVIDENCE_ROLES[number];
export const EVIDENCE_LABELS: Record<EvidenceRole, string> = { video: "Unpacking video", product: "Product received", waybill: "Reverse waybill", barcode: "Barcode image" };
export const REQUIRED_EVIDENCE: EvidenceRole[] = ["video", "product", "waybill"];
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export type ClaimEvidence = { id: string; role: EvidenceRole; name: string; type: string; bytes: number; sha256: string };
export type ClaimDraft = {
  id: string; revision: number; createdAt: string; updatedAt: string; status: "draft" | "prepared" | "submitted";
  claimsUrl: string; issue: ClaimIssue; subOrderNumber: string; awbNumber: string; packetId: string;
  condition: "" | "Intact" | "Tampered"; description: string; callbackNumber: string;
  evidence: ClaimEvidence[]; ticketId: string; operationId?: string;
};
export type ClaimPayload = Pick<ClaimDraft, "id" | "revision" | "claimsUrl" | "issue" | "subOrderNumber" | "awbNumber" | "packetId" | "condition" | "description" | "callbackNumber" | "evidence">;

export function claimsAccount(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://supplier.meesho.com" || url.username || url.password || url.search || url.hash) return null;
    return url.pathname.match(/^\/panel\/v3\/new\/fulfillment\/([\w-]+)\/claims$/)?.[1] || null;
  } catch { return null; }
}
export function emptyClaim(): ClaimDraft {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), revision: 0, createdAt: now, updatedAt: now, status: "draft", claimsUrl: DEFAULT_CLAIMS_URL, issue: "wrong_return", subOrderNumber: "", awbNumber: "", packetId: "", condition: "", description: "", callbackNumber: "", evidence: [], ticketId: "" };
}
export function claimProblems(draft: ClaimPayload, requireEvidence = true) {
  const errors: string[] = [];
  if (!claimsAccount(draft.claimsUrl)) errors.push("Use your Meesho Claims page URL.");
  if (!Object.hasOwn(CLAIM_ISSUES, draft.issue)) errors.push("Choose a return issue.");
  for (const [label, value] of [["Sub-order number", draft.subOrderNumber], ["AWB number", draft.awbNumber], ["Packet ID", draft.packetId]]) {
    if (!value.trim() || value.length > 100 || /[\x00-\x1f]/.test(value)) errors.push(`${label} is required (up to 100 characters).`);
  }
  if (!["Intact", "Tampered"].includes(draft.condition)) errors.push("Choose the actual condition of the packet.");
  if (!draft.description.trim() || draft.description.length > 1000) errors.push("Add a description of up to 1,000 characters.");
  if (draft.callbackNumber && !/^\d{10}$/.test(draft.callbackNumber)) errors.push("Enter a 10-digit callback number, or leave it empty to use Meesho’s saved number.");
  if (requireEvidence) for (const role of REQUIRED_EVIDENCE) if (!draft.evidence.some(file => file.role === role)) errors.push(`Add the ${EVIDENCE_LABELS[role].toLowerCase()}.`);
  return errors;
}
export function evidenceProblem(file: Pick<File, "name" | "type" | "size">, role: EvidenceRole) {
  if (!file.size) return "Choose a non-empty evidence file.";
  if (role === "video") {
    if (file.type !== "video/mp4" || !/\.mp4$/i.test(file.name)) return "Meesho’s unpacking-video field accepts MP4. Choose the original MP4 recording.";
    if (file.size > MAX_VIDEO_BYTES) return "This app stores videos up to 100 MB. Choose a smaller original MP4; Meesho also checks its own upload limit.";
  } else {
    if (!["image/png", "image/jpeg"].includes(file.type)) return "Choose a PNG or JPG photo.";
    if (file.size > MAX_PHOTO_BYTES) return "Choose a photo up to 10 MB. Meesho also checks its own upload limit.";
  }
  return "";
}
export async function describeEvidence(file: File, role: EvidenceRole): Promise<ClaimEvidence> {
  const problem = evidenceProblem(file, role); if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const matches = file.type === "video/mp4" ? String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    : file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!matches) throw new Error("The evidence contents do not match the file type. Choose the original recording or photo.");
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  return { id: crypto.randomUUID(), role, name: file.name.replace(/[\x00-\x1f\\/]/g, "_").slice(0, 150), type: file.type, bytes: file.size, sha256 };
}
export function claimPayload(draft: ClaimDraft): ClaimPayload {
  const { id, revision, claimsUrl, issue, subOrderNumber, awbNumber, packetId, condition, description, callbackNumber, evidence } = draft;
  return { id, revision, claimsUrl, issue, subOrderNumber: subOrderNumber.trim(), awbNumber: awbNumber.trim(), packetId: packetId.trim(), condition, description: description.trim(), callbackNumber, evidence };
}
