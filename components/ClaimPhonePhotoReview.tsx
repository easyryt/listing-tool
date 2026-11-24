"use client";

import Image from "next/image";
import { useState } from "react";
import { EVIDENCE_LABELS, type EvidenceRole } from "@/lib/meesho-claims";
import { cameraPrimary, cameraSecondary, type ReviewedVideo } from "./ClaimPhoneTakeReview";

const slots = ["product", "waybill", "barcode"] as const;
type PhotoSlot = Exclude<EvidenceRole, "video">;

export default function ClaimPhonePhotoReview({ photo, locked, attached, destination, onFinish }: {
  photo: ReviewedVideo;
  locked: boolean;
  attached: boolean;
  destination?: PhotoSlot;
  onFinish: (file?: File, role?: PhotoSlot) => Promise<void>;
}) {
  const [slot, setSlot] = useState<PhotoSlot>("product");
  return <div className="space-y-4">
    <Image src={photo.url} alt="Captured phone photo" width={1600} height={1200} unoptimized
      className="mx-auto block h-[min(60dvh,720px)] w-full rounded-xl bg-slate-950 object-contain" />
    <div className="flex flex-wrap items-end gap-3">
      {!attached && <>
        {!destination && <label className="block min-w-44 text-xs font-semibold text-slate-700">Attach to
          <select value={slot} onChange={event => setSlot(event.target.value as PhotoSlot)} disabled={locked}
            className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
            {slots.map(item => <option key={item} value={item}>{EVIDENCE_LABELS[item]}</option>)}
          </select>
        </label>}
        <button type="button" className={cameraPrimary} disabled={locked} onClick={() => void onFinish(photo.file, destination ?? slot)}>Use photo</button>
      </>}
      <button type="button" className={cameraSecondary} disabled={locked} onClick={() => void onFinish()}>{attached ? "Finish review" : "Discard photo"}</button>
    </div>
  </div>;
}
