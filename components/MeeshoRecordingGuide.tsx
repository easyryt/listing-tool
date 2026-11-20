"use client";

import { useState } from "react";
import { ArrowUpRight, Play, X } from "lucide-react";

export const MEESHO_RECORDING_GUIDE_URL = "https://youtu.be/16RCb7sDQx4";

export default function MeeshoRecordingGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Meesho’s unboxing video guide</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">Use one continuous recording. Show the label, every side of the parcel and the returned item.</p>
        </div>
        <button type="button" aria-expanded={open} aria-controls="meesho-recording-guide" onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600">
          {open ? <X size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {open ? "Close guide" : "Watch guide"}
        </button>
      </div>
      <div id="meesho-recording-guide" hidden={!open} className="border-t border-slate-200 bg-white p-3">
        {open && <iframe title="Meesho official unboxing video guide" src="https://www.youtube-nocookie.com/embed/16RCb7sDQx4?rel=0"
          className="aspect-video w-full rounded-xl border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
        <a href={MEESHO_RECORDING_GUIDE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-violet-700">
          Open guide on YouTube <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
