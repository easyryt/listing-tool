export const CLAIM_IDENTIFIER_LABELS = {
  subOrderNumber: "Sub-order number",
  awbNumber: "AWB number",
  packetId: "Packet ID",
} as const;

export type ClaimIdentifier = keyof typeof CLAIM_IDENTIFIER_LABELS;
export type ClaimIdentifiers = Record<ClaimIdentifier, string>;
export type ClaimLabelReading = {
  text: string;
  confidence: number;
  candidates: Record<ClaimIdentifier, string[]>;
  barcodeValues: string[];
  unlabelled: string[];
  warnings: string[];
};

// Identify numbers by their printed label. A product barcode alone does not
// establish whether a number is an AWB, sub-order or Packet ID.
const labelPattern = /\b(sub[\s-]*order(?:[\s-]*(?:number|no\.?|num|id))?|(?:return[\s-]+|reverse[\s-]+)?awb(?:[\s-]*(?:number|no\.?|id))?|(?:tracking|waybill|shipment)[\s-]*(?:number|no\.?|id)|packet[\s-]*(?:id|number|no\.?))\b[\s:#=.\-]*/gi;

function identifierFor(label: string): ClaimIdentifier {
  if (/^sub/i.test(label)) return "subOrderNumber";
  if (/^packet/i.test(label)) return "packetId";
  return "awbNumber";
}

function uncertainSubOrderSpacing(value: string) {
  const numeric = value.trim().match(/^\d[\d \t]*(?:[_-]\s*\d{1,4})?/)?.[0] || "";
  return /\d[ \t]+\d/.test(numeric);
}

function readValue(segment: string, field: ClaimIdentifier) {
  const value = segment.trim().replace(/^[#:=(\s]+/, "");
  if (field === "subOrderNumber" && uncertainSubOrderSpacing(value)) return "";
  // Numeric identifiers are sometimes printed in groups under a barcode.
  const numeric = value.match(/^\d[\d \t]*(?:[_-]\s*\d{1,4})?(?=$|[\s,;)])/);
  const token = (numeric?.[0] || value.match(/^[A-Z0-9][A-Z0-9_-]*/i)?.[0] || "").replace(/[ \t]/g, "");
  if (field === "subOrderNumber") return /^\d{6,30}(?:[_-]\d{1,4})?$/.test(token) ? token : "";
  if (field === "packetId" && /^NA$/i.test(token)) return "NA";
  const min = field === "awbNumber" ? 6 : 4;
  return token.length >= min && token.length <= 50 && /\d/.test(token) && /^[A-Z0-9][A-Z0-9_-]*$/i.test(token) ? token : "";
}

function isPlainIdentifier(value: string) {
  return /^\d{8,30}(?:[_-]\d{1,4})?$/.test(value)
    || (/^[A-Z0-9][A-Z0-9_-]{5,49}$/i.test(value) && /[A-Z]/i.test(value) && /\d/.test(value));
}

export function extractClaimIdentifiers(text: string, confidence = 100, decodedBarcodes: string[] = []): ClaimLabelReading {
  const normalized = text.normalize("NFKC").replace(/[–—−]/g, "-").replace(/\r/g, "");
  const candidates: ClaimLabelReading["candidates"] = { subOrderNumber: [], awbNumber: [], packetId: [] };
  const warnings: string[] = [];
  const matches = [...normalized.matchAll(new RegExp(labelPattern))];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index], field = identifierFor(match[1]);
    const following = normalized.slice(match.index! + match[0].length, matches[index + 1]?.index);
    const firstLine = following.split("\n").find(line => line.trim()) || "";
    if (field === "subOrderNumber" && uncertainSubOrderSpacing(firstLine)) warnings.push("Sub-order digits are separated. Check the photo for a missing underscore or dash and enter the number exactly as printed.");
    const value = readValue(firstLine, field);
    if (value && !candidates[field].includes(value)) candidates[field].push(value);
  }
  const labelled = new Set(Object.values(candidates).flat());
  const barcodeValues = [...new Set(decodedBarcodes.map(value => value.trim()).filter(isPlainIdentifier))];
  const standalone = normalized.split("\n").map(line => line.trim()).filter(isPlainIdentifier);
  const numbers = normalized.match(/\b\d{8,30}(?:[_-]\d{1,4})?\b/g) || [];
  const unlabelled = [...new Set([...barcodeValues, ...standalone, ...numbers])].filter(value => !labelled.has(value)).slice(0, 8);
  return { text: normalized, confidence: Number.isFinite(confidence) ? confidence : 0, candidates, barcodeValues, unlabelled, warnings: [...new Set(warnings)] };
}

export function labelAutofillChanges(reading: ClaimLabelReading, before: ClaimIdentifiers, current: ClaimIdentifiers): Partial<ClaimIdentifiers> {
  const changes: Partial<ClaimIdentifiers> = {};
  if (reading.confidence < 65) return changes;
  for (const field of Object.keys(CLAIM_IDENTIFIER_LABELS) as ClaimIdentifier[]) {
    const values = reading.candidates[field];
    if (values.length === 1 && !current[field].trim() && current[field] === before[field]) changes[field] = values[0];
  }
  return changes;
}
