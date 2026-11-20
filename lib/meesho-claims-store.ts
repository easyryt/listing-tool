"use client";

import type { ClaimDraft } from "./meesho-claims";
const DB_NAME = "listing-tool-claims-v1";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const drafts = request.result.createObjectStore("drafts", { keyPath: "id" });
      drafts.createIndex("subOrderNumber", "subOrderNumber", { unique: true });
      request.result.createObjectStore("evidence", { keyPath: "id" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); connection = undefined; }; resolve(db); };
    request.onerror = () => { connection = undefined; reject(new Error("Local storage could not be opened. Allow site storage and try again.")); };
    request.onblocked = () => { connection = undefined; reject(new Error("Close other Claims tabs, then try again.")); };
  });
  return connection;
}
export async function listClaims(): Promise<ClaimDraft[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").getAll();
    request.onsuccess = () => resolve((request.result as ClaimDraft[]).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(new Error("Could not read local claims."));
  });
}
export async function saveClaim(draft: ClaimDraft, files: ReadonlyMap<string, File> = new Map()): Promise<ClaimDraft> {
  const db = await database();
  const saved = { ...draft, subOrderNumber: draft.subOrderNumber.trim(), updatedAt: new Date().toISOString(), revision: draft.revision + 1 };
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["drafts", "evidence"], "readwrite");
    const drafts = transaction.objectStore("drafts"), evidence = transaction.objectStore("evidence");
    let reason = "Could not save the claim. Local storage may be full; your selected files are still on this page.";
    const previous = drafts.get(draft.id);
    previous.onsuccess = () => {
      const current = previous.result as ClaimDraft | undefined;
      if (current && current.revision !== draft.revision) { reason = "This claim changed in another tab. Reopen the saved draft before editing."; transaction.abort(); return; }
      for (const old of current?.evidence || []) if (!saved.evidence.some(item => item.id === old.id)) evidence.delete(old.id);
      for (const entry of saved.evidence) {
        const file = files.get(entry.id);
        if (file) evidence.put({ id: entry.id, blob: file });
        else {
          const check = evidence.get(entry.id);
          check.onsuccess = () => { if (!check.result) { reason = "A local evidence file is missing. Choose it again before saving."; transaction.abort(); } };
        }
      }
      const write = drafts.put(saved);
      write.onerror = () => { if (write.error?.name === "ConstraintError") reason = "A local claim already exists for this sub-order. Open that draft instead."; };
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onabort = transaction.onerror = () => reject(new Error(reason));
  });
}
export async function readClaimEvidence(id: string): Promise<Blob> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("evidence").objectStore("evidence").get(id);
    request.onsuccess = () => request.result?.blob instanceof Blob ? resolve(request.result.blob) : reject(new Error("Evidence is missing from this browser. Choose the original file again."));
    request.onerror = () => reject(new Error("Could not read local evidence."));
  });
}
export async function deleteClaim(draft: ClaimDraft) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["drafts", "evidence"], "readwrite"), drafts = transaction.objectStore("drafts");
    const read = drafts.get(draft.id);
    read.onsuccess = () => { const current = read.result as ClaimDraft | undefined; if (current && current.revision !== draft.revision) { transaction.abort(); return; } for (const file of current?.evidence || []) transaction.objectStore("evidence").delete(file.id); drafts.delete(draft.id); };
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error("Could not delete this draft. Reopen it and try again."));
  });
}
