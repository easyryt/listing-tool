"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Camera, Check, ChevronDown, ClipboardCheck, FileVideo, HardDrive, ImagePlus, LoaderCircle, Plus, Save, Settings2, Trash2, Upload } from "lucide-react";
import { CLAIM_ISSUES, EVIDENCE_LABELS, EVIDENCE_ROLES, REQUIRED_EVIDENCE, claimProblems, describeEvidence, emptyClaim, type ClaimDraft, type ClaimEvidence, type ClaimIssue, type EvidenceRole } from "@/lib/meesho-claims";
import { deleteClaim, listClaims, readClaimEvidence, saveClaim } from "@/lib/meesho-claims-store";
import { checkClaimsExtension, openPreparedClaim, prepareMeeshoClaim } from "@/lib/meesho-claims-client";
import ClaimLabelScanner, { type ClaimLabelScannerHandle } from "@/components/ClaimLabelScanner";
import MeeshoRecordingGuide from "@/components/MeeshoRecordingGuide";
import { CLAIM_IDENTIFIER_LABELS, type ClaimIdentifier, type ClaimIdentifiers } from "@/lib/meesho-label-reader";

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 sm:text-sm";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonClass} bg-violet-700 text-white hover:bg-violet-800`;
const secondaryButton = `${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const sectionClass = "scroll-mt-4 scroll-mb-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const labelClass = "text-sm font-medium text-slate-800";
const claimStatus = { draft: "Draft", prepared: "Ready for review", submitted: "Submitted" };
const evidenceSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function ClaimIdentifierField({ field, value, disabled, onChange, onPhoto }: { field: ClaimIdentifier; value: string; disabled: boolean; onChange: (value: string) => void; onPhoto: () => void }) {
  const label = CLAIM_IDENTIFIER_LABELS[field], id = `claim-${field}`;
  const placeholder = field === "subOrderNumber" ? "Enter the sub-order number" : field === "awbNumber" ? "Return shipment AWB" : "Enter NA only if no Packet ID is available";
  return (
    <div className="min-w-0">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <label htmlFor={id} className={labelClass}>{label}</label>
        <button type="button" disabled={disabled} aria-label={`Read ${label} from photo`} onClick={onPhoto}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50">
          <Camera size={15} aria-hidden="true" /> Read photo
        </button>
      </div>
      <input id={id} value={value} maxLength={100} disabled={disabled} onChange={event => onChange(event.target.value)} className={fieldClass} placeholder={placeholder} />
    </div>
  );
}

function EvidenceCard({ role, entry, file, disabled, onChoose, onRemove }: { role: EvidenceRole; entry?: ClaimEvidence; file?: File; disabled: boolean; onChoose: (file: File) => void; onRemove: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [missing, setMissing] = useState("");
  useEffect(() => {
    if (!entry) return;
    let alive = true, url = "";
    Promise.resolve(file || readClaimEvidence(entry.id)).then(blob => { if (alive) { url = URL.createObjectURL(blob); setPreview({ id: entry.id, url }); } }).catch(() => { if (alive) setMissing(entry.id); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [entry, file]);
  const source = entry && preview?.id === entry.id ? preview.url : "";
  const name = EVIDENCE_LABELS[role];
  const isVideo = role === "video";
  const isMissing = !!entry && missing === entry.id && !source;
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
        {source ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><Check size={14} aria-hidden="true" /> Added</span>
          : <span className="text-xs text-slate-600">{role === "barcode" ? "Optional" : "Required"}</span>}
      </div>
      {!entry && (
        <button type="button" disabled={disabled} onClick={() => picker.current?.click()} aria-label={`Add ${name.toLowerCase()}`}
          className="flex min-h-27 w-full items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-3.5 py-3 text-left hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50">
          <span className="rounded-lg bg-white p-2.5 text-violet-700">
            {isVideo ? <FileVideo size={20} aria-hidden="true" /> : <ImagePlus size={20} aria-hidden="true" />}
          </span>
          <span>
            <span className="block text-sm font-semibold text-violet-800">{isVideo ? "Add video" : "Add photo"}</span>
            <span className="mt-0.5 block text-xs text-slate-600">{isVideo ? "MP4 · up to 100 MB" : "PNG or JPG · up to 10 MB"}</span>
          </span>
        </button>
      )}
      {entry && (
        <>
          {source && (isVideo
            ? <video src={source} controls playsInline preload="metadata" aria-label="Local unboxing video preview" className="h-36 w-full rounded-lg bg-slate-950 object-contain" />
            : <Image src={source} alt={`${name} evidence preview`} width={480} height={320} unoptimized className="h-36 w-full rounded-lg bg-slate-50 object-contain" />)}
          {!source && <p className="rounded-lg bg-slate-50 px-3 py-4 text-xs text-slate-700">{isMissing ? "Local file is missing. Choose it again." : "Loading local evidence…"}</p>}
          <p className="mt-2 truncate text-xs font-medium text-slate-600" title={entry.name}>{entry.name} · {evidenceSize(entry.bytes)}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <button type="button" disabled={disabled} onClick={() => picker.current?.click()} aria-label={`Replace ${name.toLowerCase()}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50">
              <Upload size={14} aria-hidden="true" /> Replace {isVideo ? "video" : "photo"}
            </button>
            <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove ${name.toLowerCase()}`}
              className="inline-grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-50">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
      <input ref={picker} type="file" accept={isVideo ? "video/mp4,.mp4" : "image/png,image/jpeg"} disabled={disabled}
        aria-label={`Choose ${name.toLowerCase()}`} className="hidden"
        onChange={event => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) onChoose(selected);
        }}
      />
    </section>
  );
}

export default function MeeshoClaims() {
  const [claims, setClaims] = useState<ClaimDraft[]>([]), [draft, setDraft] = useState<ClaimDraft | null>(null);
  const [files, setFiles] = useState(new Map<string, File>()), [dirty, setDirty] = useState(false), [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [processing, setProcessing] = useState(false), [scanning, setScanning] = useState(false), [agreed, setAgreed] = useState(false);
  const labelScanner = useRef<ClaimLabelScannerHandle>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [connection, setConnection] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null), [operation, setOperation] = useState("");
  useEffect(() => { let alive = true; listClaims().then(saved => { if (alive) { setClaims(saved); setDraft(saved[0] || emptyClaim()); setLoaded(true); } }).catch(e => { if (alive) { setError(e.message); setLoaded(true); } }); return () => { alive = false; }; }, []);
  const locked = busy || processing || scanning, submitted = draft?.status === "submitted";
  const detailProblems = draft ? claimProblems(draft, false) : [];
  const missingEvidence = draft ? REQUIRED_EVIDENCE.filter(role => !draft.evidence.some(file => file.role === role)) : [];
  const ready = !detailProblems.length && !missingEvidence.length;
  const refresh = async () => setClaims(await listClaims());
  const edit = (changes: Partial<ClaimDraft>) => { setDraft(current => current ? { ...current, ...changes, status: "draft", operationId: undefined } : current); setDirty(true); setAgreed(false); setNotice(""); setProgress(null); setOperation(""); };
  const applyLabelNumbers = (changes: Partial<ClaimIdentifiers>, expected: ClaimIdentifiers) => {
    if (!draft || submitted) return;
    setDraft(current => {
      if (!current || current.id !== draft.id || current.status === "submitted") return current;
      const accepted = Object.fromEntries((Object.keys(changes) as ClaimIdentifier[]).filter(field => current[field] === expected[field]).map(field => [field, changes[field]]));
      return Object.keys(accepted).length ? { ...current, ...accepted, status: "draft", operationId: undefined } : current;
    });
    setDirty(true); setAgreed(false); setNotice(""); setError(""); setProgress(null); setOperation("");
  };
  const selectDraft = (next: ClaimDraft) => {
    if (locked || (dirty && !window.confirm("Leave this draft without saving its latest changes?"))) return;
    setDraft(next); setFiles(new Map()); setDirty(false); setAgreed(false); setError(""); setEvidenceError(""); setNotice(""); setProgress(null); setOperation(next.operationId || "");
  };
  const chooseEvidence = async (file: File, role: EvidenceRole) => {
    setProcessing(true); setEvidenceError("");
    try { const entry = await describeEvidence(file, role); const previousId = draft?.evidence.find(item => item.role === role)?.id; setFiles(current => { const next = new Map(current); if (previousId) next.delete(previousId); next.set(entry.id, file); return next; }); setDraft(current => current ? { ...current, evidence: [...current.evidence.filter(item => item.role !== role), entry], status: "draft", operationId: undefined } : current); setDirty(true); setAgreed(false); setProgress(null); setOperation(""); }
    catch (e) { setEvidenceError(`${EVIDENCE_LABELS[role]} · ${(e as Error).message}`); } finally { setProcessing(false); }
  };
  const removeEvidence = (role: EvidenceRole) => {
    setEvidenceError("");
    const id = draft?.evidence.find(file => file.role === role)?.id;
    if (id) setFiles(current => { const next = new Map(current); next.delete(id); return next; });
    if (draft) edit({ evidence: draft.evidence.filter(file => file.role !== role) });
  };
  const persist = async () => {
    if (!draft) throw new Error("Create a claim first.");
    if (!draft.subOrderNumber.trim()) throw new Error("Add the sub-order number before saving this local draft.");
    const saved = await saveClaim(draft, files); setDraft(saved); setFiles(new Map()); setDirty(false); await refresh(); return saved;
  };
  const save = async () => { setBusy(true); setError(""); try { await persist(); setNotice("Draft saved on this device."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const apply = async () => {
    if (!draft || !agreed || !ready || submitted) return;
    setBusy(true); setError(""); setNotice("");
    let snapshot: ClaimDraft | undefined, latestOperation = "";
    try {
      snapshot = await persist();
      const result = await prepareMeeshoClaim(snapshot, (percent, message, id) => { setProgress({ percent, message }); if (id) { latestOperation = id; setOperation(id); } });
      const saved = await saveClaim({ ...snapshot, status: "prepared", operationId: result.operationId });
      setDraft(saved); await refresh(); setNotice("Claim form prepared in Meesho.");
    } catch (e) {
      setError((e as Error).message);
      if (snapshot && latestOperation) { try { const saved = await saveClaim({ ...snapshot, operationId: latestOperation }); setDraft(saved); await refresh(); } catch { /* Keep the operation available on this page if local saving fails. */ } }
    } finally { setBusy(false); setAgreed(false); }
  };
  const markSubmitted = async () => {
    if (!draft?.ticketId.trim()) { setError("Enter the actual ticket ID shown by Meesho after submission."); return; }
    setBusy(true); setError("");
    try { const saved = await saveClaim({ ...draft, status: "submitted", ticketId: draft.ticketId.trim() }, files); setDraft(saved); setFiles(new Map()); setDirty(false); await refresh(); setNotice("Submitted ticket recorded locally."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft || !window.confirm("Delete this local draft and its saved evidence? The original files and Meesho ticket are kept.")) return;
    setBusy(true); setError("");
    try { await deleteClaim(draft); const remaining = await listClaims(); setClaims(remaining); setDraft(remaining[0] || emptyClaim()); setFiles(new Map()); setDirty(false); setProgress(null); setOperation(""); setAgreed(false); setNotice(""); setEvidenceError(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const canSave = !!draft?.subOrderNumber.trim() && !locked && !submitted;
  const preparedOperation = operation || draft?.operationId;
  const nextSection = detailProblems.length ? "claim-details" : missingEvidence.length ? "claim-evidence" : "claim-review";
  const nextLabel = detailProblems.length ? "Claim details" : missingEvidence.length ? "Add evidence" : "Review claim";
  const saveStatus = dirty ? "Unsaved changes" : submitted ? "Ticket recorded" : draft?.revision ? "Saved on this device" : "New draft";
  const steps = [
    { id: "claim-details", label: "Claim details", done: !detailProblems.length, hint: detailProblems.length ? "Scan or enter details" : "Details complete" },
    { id: "claim-evidence", label: "Evidence", done: !missingEvidence.length, hint: `${REQUIRED_EVIDENCE.length - missingEvidence.length} of ${REQUIRED_EVIDENCE.length} required files` },
    { id: "claim-review", label: "Review", done: !!submitted || draft?.status === "prepared", hint: submitted ? "Ticket recorded" : draft?.status === "prepared" ? "Form prepared" : "Fill in Meesho" },
  ];

  const openForm = () => {
    if (preparedOperation) void openPreparedClaim(preparedOperation).catch(e => setError(e.message));
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-6 pt-7 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Meesho claims</h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">Prepare a return claim and its evidence in one place.</p>
        </div>
        <button type="button" disabled={locked || !loaded} onClick={() => selectDraft(emptyClaim())} className={primaryButton}>
          <Plus size={18} aria-hidden="true" /> New claim
        </button>
      </header>

      {!loaded && <p role="status" className="py-16 text-center text-sm text-slate-600">Loading saved claims…</p>}
      {loaded && !draft && error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

      {draft && (
        <div className="grid items-start gap-5 lg:grid-cols-[225px_minmax(0,1fr)] lg:gap-7">
          <aside className="space-y-4 lg:sticky lg:top-4">
            {claims.length > 0 && (
              <label className="block rounded-xl bg-white px-3.5 pb-3.5 pt-3 text-sm font-medium text-slate-800 ring-1 ring-slate-200 lg:hidden">
                Saved claims
                <select value={draft.revision ? draft.id : ""} disabled={locked} className={fieldClass}
                  onChange={event => {
                    const selected = claims.find(claim => claim.id === event.target.value);
                    if (selected) selectDraft(selected);
                  }}>
                  <option value="" disabled>Choose a saved claim</option>
                  {claims.map(claim => <option key={claim.id} value={claim.id}>{claim.subOrderNumber} · {claimStatus[claim.status]}</option>)}
                </select>
              </label>
            )}

            <nav aria-label="Claim steps" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <ol className="grid grid-cols-3 gap-1 lg:grid-cols-1">
                {steps.map((step, index) => (
                  <li key={step.id} className="min-w-0">
                    <a href={`#${step.id}`}
                      className={`flex h-full items-center gap-2 rounded-xl px-1.5 py-2.5 text-slate-800 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 sm:px-3 lg:gap-3 ${step.id === nextSection && !submitted ? "bg-violet-50" : ""}`}>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold sm:size-8 ${step.done ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>
                        {step.done ? <Check size={15} aria-label="Complete" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold sm:text-sm">{step.label}</span>
                        <span className="mt-0.5 hidden text-xs text-slate-600 lg:block">{step.hint}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <section aria-label="Saved claims" className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
              <h2 className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm font-semibold text-slate-800">
                <span className="flex items-center gap-2"><ClipboardCheck size={16} aria-hidden="true" /> Saved claims</span>
                <span className="text-xs font-normal tabular-nums text-slate-600">{claims.length}</span>
              </h2>
              {claims.length ? (
                <ul className="mt-2 max-h-[38vh] space-y-1 overflow-auto">
                  {claims.map(claim => (
                    <li key={claim.id}>
                      <button type="button" aria-current={claim.id === draft.id ? "true" : undefined} disabled={locked}
                        onClick={() => { if (claim.id !== draft.id) selectDraft(claim); }}
                        className={`block w-full min-w-0 rounded-lg border px-2.5 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50 ${claim.id === draft.id ? "border-violet-200 bg-violet-50" : "border-transparent"}`}>
                        <span className="block truncate text-sm font-semibold text-slate-900" title={claim.subOrderNumber}>{claim.subOrderNumber}</span>
                        <span className="mt-0.5 block text-xs text-slate-600">{claimStatus[claim.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-2 pb-2 pt-1 text-xs text-slate-600">Your saved drafts and tickets will appear here.</p>}
            </section>

            <p className="hidden items-start gap-2 px-2 text-xs leading-5 text-slate-600 lg:flex">
              <HardDrive size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Saved claims stay in this browser. Keep your original files.
            </p>
          </aside>

          <div className="min-w-0 space-y-4 sm:space-y-5">
            <section id="claim-details" tabIndex={-1} aria-labelledby="claim-details-title" className={sectionClass}>
              <h2 id="claim-details-title" className="text-xl font-bold text-slate-950">Claim details</h2>
              <div className="mb-5 mt-4">
                <ClaimLabelScanner key={draft.id} ref={labelScanner} disabled={locked || submitted}
                  values={{ subOrderNumber: draft.subOrderNumber, awbNumber: draft.awbNumber, packetId: draft.packetId }}
                  onApply={applyLabelNumbers} onBusyChange={setScanning} />
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <ClaimIdentifierField field="subOrderNumber" value={draft.subOrderNumber} disabled={locked || submitted}
                  onChange={value => edit({ subOrderNumber: value })} onPhoto={() => labelScanner.current?.choose("subOrderNumber")} />
                <ClaimIdentifierField field="awbNumber" value={draft.awbNumber} disabled={locked || submitted}
                  onChange={value => edit({ awbNumber: value })} onPhoto={() => labelScanner.current?.choose("awbNumber")} />
                <ClaimIdentifierField field="packetId" value={draft.packetId} disabled={locked || submitted}
                  onChange={value => edit({ packetId: value })} onPhoto={() => labelScanner.current?.choose("packetId")} />
                <label className={labelClass}>
                  <span className="flex min-h-9 items-center">Packet condition</span>
                  <select value={draft.condition} disabled={locked || submitted} onChange={event => edit({ condition: event.target.value as ClaimDraft["condition"] })} className={fieldClass}>
                    <option value="">Choose the actual condition</option><option>Intact</option><option>Tampered</option>
                  </select>
                </label>
                <label className={`${labelClass} mt-1 sm:col-span-2`}>
                  Claim issue
                  <select value={draft.issue} disabled={locked || submitted} onChange={event => edit({ issue: event.target.value as ClaimIssue })} className={fieldClass}>
                    {Object.entries(CLAIM_ISSUES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <label htmlFor="claim-description" className={labelClass}>Description</label>
                  <textarea id="claim-description" rows={3} value={draft.description} maxLength={1000} disabled={locked || submitted}
                    onChange={event => edit({ description: event.target.value })} className={fieldClass}
                    placeholder="What did you send, what came back, and what’s wrong?" aria-describedby="claim-description-count" />
                  <p id="claim-description-count" className="text-right text-xs text-slate-600">{draft.description.length}/1000</p>
                </div>
              </div>
              <details className="group mt-4 border-t border-slate-200 pt-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-violet-600 [&::-webkit-details-marker]:hidden">
                  <Settings2 size={16} aria-hidden="true" /> Meesho settings
                  <ChevronDown size={16} className="ml-auto group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid gap-4 pb-2 pt-2 sm:grid-cols-2">
                  <label className={labelClass}>
                    Callback number <span className="text-xs font-normal text-slate-600">(optional)</span>
                    <input type="tel" inputMode="numeric" value={draft.callbackNumber} maxLength={10} disabled={locked || submitted}
                      onChange={event => edit({ callbackNumber: event.target.value.replace(/\D/g, "") })} className={fieldClass} placeholder="Use Meesho’s saved number" />
                  </label>
                  <label className={labelClass}>
                    Meesho Claims page
                    <input type="url" value={draft.claimsUrl} disabled={locked || submitted} onChange={event => edit({ claimsUrl: event.target.value })} className={fieldClass} />
                  </label>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                    <button type="button" disabled={locked} className={secondaryButton}
                      onClick={async () => {
                        setConnection("Checking extension…");
                        try { setConnection(`Extension ${await checkClaimsExtension()} connected`); }
                        catch (e) { setConnection((e as Error).message); }
                      }}>
                      Check extension
                    </button>
                    <a href="/listing-meesho-extension.zip" download className="text-sm font-semibold text-violet-700 underline">Get updated extension</a>
                    <p role="status" className="w-full text-xs leading-5 text-slate-700">{connection}</p>
                  </div>
                </div>
              </details>
            </section>

            <section id="claim-evidence" tabIndex={-1} aria-labelledby="claim-evidence-title" className={sectionClass}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="claim-evidence-title" className="text-xl font-bold text-slate-950">Original evidence</h2>
                  <p className="mt-1 text-sm text-slate-600">Add the unboxing video and two required photos.</p>
                </div>
                <span role="status" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                  {processing && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
                  {processing ? "Adding file…" : `${REQUIRED_EVIDENCE.length - missingEvidence.length}/${REQUIRED_EVIDENCE.length} required added`}
                </span>
              </div>
              <MeeshoRecordingGuide />
              {evidenceError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{evidenceError}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {EVIDENCE_ROLES.map(role => {
                  const entry = draft.evidence.find(file => file.role === role);
                  return <EvidenceCard key={role} role={role} entry={entry} file={entry && files.get(entry.id)} disabled={locked || submitted}
                    onChoose={file => void chooseEvidence(file, role)} onRemove={() => removeEvidence(role)} />;
                })}
              </div>
              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600">
                <HardDrive size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                Files stay in this browser until you send them to Meesho. Clearing site data removes saved evidence.
              </p>
            </section>

            <section id="claim-review" tabIndex={-1} aria-labelledby="claim-review-title" className={sectionClass}>
              <h2 id="claim-review-title" className="text-xl font-bold text-slate-950">Review claim</h2>
              {submitted ? <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800"><Check size={17} aria-hidden="true" /> Ticket recorded · {draft.ticketId}</p> : (
                <>
                  <p className="mt-1 text-sm leading-6 text-slate-600">The extension fills the form. Review the result and submit it yourself in Meesho.</p>
                  {!ready && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {!!detailProblems.length && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950">
                          <a href="#claim-details" className="font-semibold underline underline-offset-2">Complete claim details</a>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                            {detailProblems.map(problem => <li key={problem}>{problem}</li>)}
                          </ul>
                        </div>
                      )}
                      {!!missingEvidence.length && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950">
                          <a href="#claim-evidence" className="font-semibold underline underline-offset-2">Add missing evidence</a>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                            {missingEvidence.map(role => <li key={role}>{EVIDENCE_LABELS[role]}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {ready && (
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-sm leading-5 text-slate-800">
                      <input type="checkbox" checked={agreed} disabled={locked} onChange={event => setAgreed(event.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-violet-700" />
                      <span>
                        <strong className="block">{draft.status === "prepared" ? "Prepare a new Meesho form" : "I checked this claim’s details and evidence."}</strong>
                        Send the claim details and files to my signed-in Meesho account when I choose Fill claim in Meesho.
                      </span>
                    </label>
                  )}
                  {ready && draft.status === "prepared" && (
                    <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800">
                      <Check size={18} className="shrink-0" aria-hidden="true" /> Form prepared. Open it to check the details and uploads.
                    </p>
                  )}
                  {preparedOperation && draft.status !== "prepared" && (
                    <button type="button" disabled={locked} className={`${secondaryButton} mt-3`} onClick={openForm}>
                      <ArrowUpRight size={16} aria-hidden="true" /> Open prepared form
                    </button>
                  )}
                  {progress && (
                    <div className="mt-4">
                      <progress aria-label="Claim form preparation" max={100} value={progress.percent} className="h-2 w-full accent-violet-700" />
                      <p role="status" className="mt-1.5 text-xs text-slate-700">{progress.message}</p>
                    </div>
                  )}
                  {!!draft.revision && (
                    <details className="group mt-4 border-t border-slate-200 pt-2" open={draft.status === "prepared" || undefined}>
                      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-violet-600 [&::-webkit-details-marker]:hidden">
                        Record a submitted ticket <ChevronDown size={16} className="group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className={`${labelClass} min-w-0 grow`}>
                          Meesho ticket ID
                          <input value={draft.ticketId} maxLength={100} disabled={locked}
                            onChange={event => {
                              setDraft(current => current ? { ...current, ticketId: event.target.value } : current);
                              setDirty(true);
                              setNotice("");
                            }} className={fieldClass} placeholder="Enter the ID from Meesho" />
                        </label>
                        <button type="button" disabled={locked || !draft.ticketId.trim()} onClick={() => void markSubmitted()} className={secondaryButton}>Record ticket</button>
                      </div>
                    </details>
                  )}
                </>
              )}
              {!!draft.revision && (
                <div className="mt-4 border-t border-slate-200 pt-2">
                  <button type="button" disabled={locked} onClick={() => void remove()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-medium text-rose-700 hover:underline focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-50">
                    <Trash2 size={15} aria-hidden="true" /> Delete local {submitted ? "record" : "draft"}
                  </button>
                </div>
              )}
            </section>

            <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_8px_32px_rgba(15,23,42,0.14)] sm:bottom-4 sm:p-3">
              {error && <p role="alert" className="mb-2 max-h-24 overflow-auto rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p role="status" className="flex items-center gap-1.5 px-1 text-xs font-medium text-slate-700">
                  {dirty ? <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" /> : <HardDrive size={15} aria-hidden="true" />}
                  {notice || saveStatus}
                </p>
                {!submitted && (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    <button type="button" disabled={!canSave} title={!draft.subOrderNumber.trim() ? "Add a sub-order number to save" : undefined}
                      onClick={() => void save()} className={`${secondaryButton} flex-1 whitespace-nowrap px-3 sm:flex-none`}>
                      <Save size={16} aria-hidden="true" /> Save draft
                    </button>
                    {ready && agreed ? (
                      <button type="button" disabled={locked} onClick={() => void apply()} className={`${primaryButton} flex-1 whitespace-nowrap px-3 sm:flex-none`}>
                        {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />} Fill claim in Meesho
                      </button>
                    ) : draft.status === "prepared" && preparedOperation ? (
                      <button type="button" disabled={locked} onClick={openForm} className={`${primaryButton} flex-1 whitespace-nowrap px-3 sm:flex-none`}>
                        Open prepared form <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <a href={`#${nextSection}`} className={`${primaryButton} flex-1 whitespace-nowrap px-3 sm:flex-none`}>
                        {nextLabel} <ArrowDown size={16} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
