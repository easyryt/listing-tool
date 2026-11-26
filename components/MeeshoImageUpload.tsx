"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, ImageUp, LoaderCircle, Settings2 } from "lucide-react";
import UploadedImagePreview from "./UploadedImagePreview";
import { canApplyMeeshoReceipt, MEESHO_SUPPLIER_HOME, type MeeshoTarget } from "@/lib/meesho-upload-contract";
import { checkMeeshoExtension, getMeeshoUpload, markMeeshoApplied, resumeMeeshoUpload, savedMeeshoPanel, saveMeeshoPanel, startMeeshoUpload, subscribeMeesho } from "@/lib/meesho-upload-client";

export default function MeeshoImageUpload({ target, value, onChange, disabled = false, file, label = "Upload to Meesho" }: {
  target: MeeshoTarget; value: string; onChange: (url: string) => void; disabled?: boolean; file?: File | null; label?: string;
}) {
  const upload = useSyncExternalStore(subscribeMeesho, () => getMeeshoUpload(target), () => null);
  const [error, setError] = useState(""), [settings, setSettings] = useState(false), [panel, setPanel] = useState("");
  const [connection, setConnection] = useState(""), [checking, setChecking] = useState(false);
  const picker = useRef<HTMLInputElement>(null), applying = useRef("");
  const receipt = upload?.receipt;
  const conflict = !!upload && !!receipt && ((upload.superseded && value !== receipt.url) || !canApplyMeeshoReceipt(receipt, upload, value, upload.initialValue));
  const active = !!upload && (["running", "queued"].includes(upload.phase) || (upload.phase === "ready" && !conflict));
  useEffect(() => {
    if (!upload || upload.phase !== "ready" || !receipt || conflict || disabled) return;
    if (value === receipt.url) { markMeeshoApplied(target, upload.id); return; }
    if (applying.current === upload.id) return;
    applying.current = upload.id;
    onChange(receipt.url);
  }, [upload, receipt, value, target, onChange, disabled, conflict]);
  const select = (selected?: File) => { if (!selected) return; setError(""); applying.current = ""; try { void startMeeshoUpload(selected, target, value); } catch (e) { setError(e instanceof Error ? e.message : "Choose an image."); } };
  return <div className="mt-2 space-y-2" data-meesho-target={`${target.rowId}:${target.field}`}>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={disabled || active} onClick={() => file ? select(file) : picker.current?.click()} aria-label={`${label} for ${target.field} ${target.rowId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">{active ? <LoaderCircle size={14} className="animate-spin" /> : <ImageUp size={14} />}{label}</button>
      <input ref={picker} type="file" accept="image/png,image/jpeg" className="hidden" aria-label={`Choose Meesho image for ${target.field} ${target.rowId}`} onChange={e => { const selected = e.target.files?.[0]; e.target.value = ""; select(selected); }} />
      <button type="button" disabled={active} aria-label="Meesho upload settings" title="Meesho upload settings" onClick={() => { setPanel(savedMeeshoPanel()); setSettings(v => !v); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Settings2 size={14} /></button>
    </div>
    {settings && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="text-slate-600">Sign in to Meesho in this Chrome profile and leave your Image Bulk Upload page open for automatic account selection.</p>
      <a href={MEESHO_SUPPLIER_HOME} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-violet-700 hover:underline">Open Meesho Supplier Panel</a>
      <label className="block font-semibold">Seller’s upload page (optional)
        <input type="url" value={panel} onChange={e => setPanel(e.target.value)} placeholder="Automatically detect an open Meesho seller page" className="mt-1 w-full rounded border border-slate-200 bg-white p-2 font-normal" />
      </label>
      <button type="button" onClick={() => { try { saveMeeshoPanel(panel.trim()); setSettings(false); setError(""); } catch (e) { setError((e as Error).message); } }} className="font-semibold text-violet-700">{panel.trim() ? "Save seller page" : "Use automatic selection"}</button>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-2">
        <button type="button" disabled={checking} onClick={async () => { setChecking(true); try { setConnection(`Extension ${await checkMeeshoExtension()} connected.`); setError(""); } catch (e) { setConnection(""); setError((e as Error).message); } finally { setChecking(false); } }} className="font-semibold text-violet-700 disabled:opacity-50">{checking ? "Checking extension…" : "Check extension connection"}</button>
        <a href="/listing-meesho-extension.zip" download className="text-violet-700 underline">Download extension 0.12.0</a>
      </div>
      {connection && <p role="status" className="font-semibold text-emerald-700">{connection}</p>}
    </div>}
    {upload && <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-medium text-slate-700" title={upload.originalName}>{upload.originalName}</span><span className="font-bold text-violet-700">{upload.progress}%</span></div>
      <div role="progressbar" aria-label={`Meesho upload and link progress for ${target.field}`} aria-valuenow={upload.progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div style={{ width: `${upload.progress}%` }} className={`h-full rounded-full transition-[width] duration-300 ${upload.phase === "applied" ? "bg-emerald-500" : "bg-violet-500"}`} /></div>
      <p role="status" className={`mt-2 flex items-start gap-1 text-[11px] leading-4 ${upload.phase === "error" || conflict ? "text-rose-600" : upload.phase === "applied" ? "text-emerald-700" : "text-slate-600"}`}>{upload.phase === "applied" && <Check size={13} className="shrink-0" />}{conflict ? "This field changed during upload. Its newer value was preserved." : upload.message}</p>
      {upload.phase === "error" && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-violet-700">
        {upload.canResume && <button type="button" disabled={disabled} onClick={() => void resumeMeeshoUpload(target)}>Check / retry this saved upload</button>}
        {/Sign in to (?:the )?(?:correct )?Meesho/i.test(upload.message) && <a href={MEESHO_SUPPLIER_HOME} target="_blank" rel="noopener noreferrer" className="hover:underline">Open Meesho Supplier Panel</a>}
      </div>}
      {receipt && <div className="mt-2 space-y-2"><UploadedImagePreview url={receipt.url} name={upload.originalName} /><div className="flex flex-wrap gap-3 text-[11px] font-semibold text-violet-700"><button type="button" onClick={() => void navigator.clipboard.writeText(receipt.url).catch(() => setError("Select the image URL field and press Ctrl+C."))} className="inline-flex items-center gap-1"><Copy size={11} />Copy link</button>{conflict && <button type="button" disabled={disabled} onClick={() => { onChange(receipt.url); }}>Use this uploaded image</button>}</div></div>}
    </div>}
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
  </div>;
}
