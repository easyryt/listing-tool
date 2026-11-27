"use client";

import { useSyncExternalStore } from "react";
import { checkMeeshoExtension, getInitialMeeshoExtensionState, getMeeshoExtensionState, subscribeMeeshoExtension } from "@/lib/meesho-upload-client";

export function useMeeshoExtension() {
  return useSyncExternalStore(subscribeMeeshoExtension, getMeeshoExtensionState, getInitialMeeshoExtensionState);
}

export default function MeeshoExtensionStatus({ connection }: { connection: ReturnType<typeof useMeeshoExtension> }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    <p role="status" className={connection.phase === "connected" ? "font-semibold text-emerald-700" : "text-slate-600"}>
      {connection.phase === "checking" ? "Connecting to Browser AI Test…" : connection.phase === "connected"
        ? `Browser AI Test${connection.version ? ` ${connection.version}` : ""} connected`
        : connection.message}
    </p>
    {connection.phase === "unavailable" && <>
      <button type="button" onClick={() => void checkMeeshoExtension().catch(() => {})} className="font-semibold text-violet-700 hover:underline">Retry connection</button>
      <a href="/listing-meesho-extension.zip" download className="font-semibold text-violet-700 hover:underline">Download extension</a>
    </>}
  </div>;
}
