"use client";

import { ChevronRight, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import type { AdminArea } from "../model/use-admin-areas";

interface Props {
  label: string;
  areas: AdminArea[];
  loading: boolean;
  error: string | null;
  loadingHint?: string;
  onRetry: () => void;
  onSelect: (a: AdminArea) => void;
  selectedId?: string | null;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Searchable list of regions or districts (dark glass panel style). */
export function AreaPicker({ label, areas, loading, error, loadingHint, onRetry, onSelect, selectedId }: Props) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = norm(q.trim());
    return n ? areas.filter((a) => norm(a.name).includes(n)) : areas;
  }, [areas, q]);

  if (error) {
    return (
      <div className="rounded-xl bg-white/6 p-4 text-center text-[13px] text-white/70">
        <p>{error}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-[12.5px] font-semibold text-deep">
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="relative block">
        <span className="sr-only">Search {label.toLowerCase()}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/45" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          disabled={loading}
          className="h-11 w-full rounded-xl bg-white/8 pr-3 pl-10 text-[14px] text-white ring-1 ring-white/10 outline-none placeholder:text-white/40 focus:ring-lime/60 disabled:opacity-50"
        />
      </label>
      {loading ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {loadingHint && <p className="px-1 text-[12px] text-white/50">{loadingHint}</p>}
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} dark className="h-10" />
          ))}
        </div>
      ) : (
        <ul className="scroll-quiet-dark mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={label}>
          {list.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-white/50">Nothing matches “{q}”.</li>}
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors",
                  selectedId === a.id ? "bg-lime/15 text-white ring-1 ring-lime/30" : "text-white/85 hover:bg-white/8",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <ChevronRight className="size-4 text-white/35" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
