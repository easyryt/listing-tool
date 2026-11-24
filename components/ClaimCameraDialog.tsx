"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function ClaimCameraDialog({ title, closeDisabled = false, onClose, children }: {
  title: string;
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!closeDisabled) onClose(); }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-[#0d1421] text-white backdrop:bg-slate-950">
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0d1421]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-8">
        <h2 id={titleId} className="font-semibold tracking-tight sm:text-lg">{title}</h2>
        <button type="button" aria-label="Close camera dialog" onClick={onClose} disabled={closeDisabled}
          className="grid size-11 place-items-center rounded-full border border-white/20 text-white outline-offset-4 hover:bg-white/10 focus-visible:outline-2 disabled:opacity-35">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-7">{children}</div>
  </dialog>;
}
