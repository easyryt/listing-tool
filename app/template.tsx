import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, PackagePlus } from "lucide-react";

export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Product listing navigation" className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-bold text-slate-800 hover:text-violet-700">
            Listing tool
          </Link>
          <div className="flex flex-wrap items-center gap-3">
          <Link href="/claims" className="text-sm font-semibold text-violet-700 hover:underline">Meesho claims</Link>
          <Link href="/general-products" className="text-sm font-semibold text-violet-700 hover:underline">General products & analytics</Link>
          <Link href="/create-general-product" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700">
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            New general product
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
