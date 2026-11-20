"use client";

import Image from "next/image";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Camera, Check, LoaderCircle, ScanLine, X } from "lucide-react";
import { CLAIM_IDENTIFIER_LABELS, labelAutofillChanges, type ClaimIdentifier, type ClaimIdentifiers, type ClaimLabelReading } from "@/lib/meesho-label-reader";
import { labelPhotoProblem, readClaimLabel, type LabelScanProgress } from "@/lib/meesho-label-ocr";

export type ClaimLabelScannerHandle = { choose: (field?: ClaimIdentifier) => void };
type Scan = { name: string; url: string; reading?: ClaimLabelReading; progress?: LabelScanProgress; target?: ClaimIdentifier };

export default function ClaimLabelScanner({ ref, values, disabled, onApply, onBusyChange }: {
  ref?: Ref<ClaimLabelScannerHandle>;
  values: ClaimIdentifiers;
  disabled: boolean;
  onApply: (changes: Partial<ClaimIdentifiers>, expected: ClaimIdentifiers) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null), target = useRef<ClaimIdentifier | undefined>(undefined);
  const panel = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null), photoUrl = useRef("");
  const latestValues = useRef(values);
  const [scan, setScan] = useState<Scan | null>(null), [error, setError] = useState("");
  useEffect(() => { latestValues.current = values; }, [values]);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; if (photoUrl.current) URL.revokeObjectURL(photoUrl.current); }, []);
  const choose = (field?: ClaimIdentifier) => { if (disabled || controller.current) return; target.current = field; picker.current?.click(); };
  useImperativeHandle(ref, () => ({ choose }));

  const read = async (file: File) => {
    const problem = labelPhotoProblem(file);
    if (problem) { setError(problem); return; }
    const job = new AbortController(), before = { ...values };
    controller.current?.abort(); controller.current = job;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = URL.createObjectURL(file);
    setError(""); setScan({ name: file.name, url: photoUrl.current, target: target.current, progress: { percent: 1, message: "Opening label photo…" } });
    onBusyChange(true);
    if (target.current) {
      panel.current?.scrollIntoView({ block: "start" });
      panel.current?.focus({ preventScroll: true });
    }
    try {
      const reading = await readClaimLabel(file, progress => { if (controller.current === job) setScan(current => current ? { ...current, progress } : current); }, job.signal);
      if (controller.current !== job) return;
      const current = latestValues.current, changes = labelAutofillChanges(reading, before, current);
      if (Object.keys(changes).length) onApply(changes, current);
      setScan(current => current ? { ...current, reading, progress: undefined } : current);
    } catch (e) {
      if (controller.current === job) { setError(job.signal.aborted ? "Reading cancelled. You can enter the numbers yourself or try another photo." : (e as Error).message); setScan(current => current ? { ...current, progress: undefined } : current); }
    } finally {
      if (controller.current === job) { controller.current = null; onBusyChange(false); }
    }
  };
  const applyNumber = (field: ClaimIdentifier, value: string) => onApply({ [field]: value }, latestValues.current);
  const matches = scan?.reading && (Object.keys(CLAIM_IDENTIFIER_LABELS) as ClaimIdentifier[]).filter(field => scan.reading!.candidates[field].length);
  const hasDetections = !!(matches?.length || scan?.reading?.unlabelled.length);

  return <div ref={panel} tabIndex={-1} aria-label="Shipping label scanner" className="scroll-mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 focus:outline-2 focus:outline-violet-500">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-white p-2 text-violet-700"><ScanLine size={22} aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-bold text-slate-950">Scan your shipping label</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-700">Read the printed IDs, barcodes and QR codes on your label.</p>
          <p className="mt-1 text-xs text-slate-600">PNG, JPG or WebP · up to 10 MB · scanned on this device</p>
        </div>
      </div>
      <button type="button" disabled={disabled} onClick={() => choose()}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:opacity-50">
        <Camera size={18} aria-hidden="true" /> {scan ? "Choose another label" : "Upload shipping label"}
      </button>
    </div>
    <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} className="hidden" aria-label="Choose a claim label photo" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void read(file); }} />
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p>}
    {scan && <div className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row">
      <div className="w-full shrink-0 sm:w-36"><a href={scan.url} target="_blank" rel="noreferrer" aria-label="View the scanned label photo"><Image src={scan.url} alt="Uploaded claim label" width={320} height={220} unoptimized className="h-28 w-full rounded-lg bg-slate-50 object-contain" /></a><p className="mt-1 truncate text-[10px] text-slate-500" title={scan.name}>{scan.name}</p></div>
      <div className="min-w-0 flex-1">
        {scan.progress ? <div role="status"><p className="flex items-center gap-2 text-xs font-semibold text-violet-700"><LoaderCircle size={15} className="animate-spin" />{scan.progress.message}</p><progress aria-label="Reading label photo" max={100} value={scan.progress.percent} className="mt-3 h-2 w-full accent-violet-600" /><button type="button" onClick={() => controller.current?.abort()} className="mt-2 text-xs font-semibold text-slate-500 underline">Cancel reading</button></div> : scan.reading ? <>
          <p role="status" className="text-sm font-semibold text-slate-900">{hasDetections ? "Review the detected IDs" : "No IDs found"}</p>
          {scan.reading.warnings.map(warning => <p key={warning} className="mt-2 text-xs leading-5 text-amber-700">{warning}</p>)}
          {!!matches?.length && <div className="mt-2 space-y-3">{matches.map(field => <div key={field}><p className="text-[11px] font-semibold text-slate-500">{CLAIM_IDENTIFIER_LABELS[field]}{scan.reading!.candidates[field].length > 1 ? " · choose the correct match" : ""}</p><div className="mt-1 flex flex-wrap gap-2">{scan.reading!.candidates[field].map(value => <button type="button" key={value} disabled={disabled || values[field] === value} onClick={() => applyNumber(field, value)} className="inline-flex max-w-full items-center gap-1.5 break-all rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700">{values[field] === value && <Check size={13} className="shrink-0" />}{value}<span className="shrink-0 font-normal">{values[field] === value ? "In form" : "Use number"}</span></button>)}</div></div>)}</div>}
          {!hasDetections && <p className="mt-2 text-xs leading-5 text-slate-500">Try a well-lit close-up of the printed ID or barcode.</p>}
          {scan.reading.confidence < 65 && !!matches?.length && <p className="mt-2 text-xs text-amber-700">Some text is unclear. Check the photo, then choose a number to use.</p>}
          {!!scan.reading.unlabelled.length && <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-xs leading-5 text-slate-600">Choose the field that matches the code on your label.</p>
            <div className="mt-2 space-y-2">{scan.reading.unlabelled.map(value => {
              const field = scan.target;
              const assigned = field && values[field] === value;
              const fromBarcode = scan.reading!.barcodeValues.includes(value);
              return <div key={value} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-600">{fromBarcode ? "From barcode or QR code" : "From printed text"}</p>
                  <p className="break-all font-mono text-sm font-semibold text-slate-900">{value}</p>
                </div>
                {field ? <button type="button" disabled={disabled || assigned} onClick={() => applyNumber(field, value)} className="min-h-9 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 disabled:border-slate-200 disabled:text-slate-600">{assigned ? `In ${CLAIM_IDENTIFIER_LABELS[field]}` : `Use for ${CLAIM_IDENTIFIER_LABELS[field]}`}</button> : <select aria-label={`Use ${value} as`} value={(Object.keys(CLAIM_IDENTIFIER_LABELS) as ClaimIdentifier[]).find(field => values[field] === value) ?? ""} disabled={disabled} onChange={event => { if (event.target.value) applyNumber(event.target.value as ClaimIdentifier, value); }} className="min-h-9 rounded-lg border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-700"><option value="" disabled>Use as…</option>{Object.entries(CLAIM_IDENTIFIER_LABELS).map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select>}
              </div>;
            })}</div>
          </div>}
          {scan.reading.text.trim() && <details className="mt-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-500">View text read from photo</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-500">{scan.reading.text}</pre></details>}
        </> : <p className="text-xs text-slate-500">Choose a clearer photo to try again.</p>}
      </div>
      {!scan.progress && <button type="button" disabled={disabled} aria-label="Remove label scan" onClick={() => { if (photoUrl.current) URL.revokeObjectURL(photoUrl.current); photoUrl.current = ""; setScan(null); setError(""); }} className="self-start rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={15} /></button>}
    </div>}
  </div>;
}
