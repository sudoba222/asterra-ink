"use client";

import { Building2, Crown, MousePointerClick, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useCitySearch, type City } from "@/entities/city";
import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";

interface Props {
  iso3: string;
  cities: City[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (c: City) => void;
  onHover?: (id: string | null) => void;
  selectedId?: string | null;
  /** Total GeoNames places in the country (the list holds only the most populous). */
  total?: number;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function people(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M people`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k people`;
  return n > 0 ? `${n} people` : "";
}

/**
 * Searchable list of a country's cities and towns (most populous first). Typing searches
 * the loaded list instantly and, for 2+ letters, GeoNames too — so small towns outside the
 * list can still be found. Matches the dark glass panel style of the region picker.
 */
export function CityPicker({ iso3, cities, loading, error, onRetry, onSelect, onHover, selectedId, total }: Props) {
  const [q, setQ] = useState("");
  const remote = useCitySearch(iso3, q);
  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return cities;
    const local = cities.filter((c) => norm(c.name).includes(n));
    const seen = new Set(local.map((c) => c.id));
    const extra = (remote.data?.cities ?? []).filter((c) => !seen.has(c.id));
    return [...local, ...extra];
  }, [cities, q, remote.data]);
  const searching = q.trim().length >= 2 && remote.status === "loading";

  if (error) {
    return (
      <div className="rounded-xl bg-white/6 p-4 text-center text-[13px] text-white/70">
        <p>{error}</p>
        <p className="mt-1 text-[12px] text-white/45">You can still click the map near your field, or skip this step.</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-[12.5px] font-semibold text-deep">
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="relative block">
        <span className="sr-only">Search cities and towns</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/45" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a city or town…"
          disabled={loading}
          className="h-11 w-full rounded-xl bg-white/8 pr-3 pl-10 text-[14px] text-white ring-1 ring-white/10 outline-none placeholder:text-white/40 focus:ring-lime/60 disabled:opacity-50"
        />
      </label>
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] text-white/50">
        <MousePointerClick className="size-3.5 text-lime/70" aria-hidden /> Or click the map near your field.
      </p>
      {loading ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} dark className="h-11" />
          ))}
        </div>
      ) : (
        <ul className="scroll-quiet-dark mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Cities and towns" onMouseLeave={() => onHover?.(null)}>
          {list.length === 0 && (
            <li className="px-2 py-6 text-center text-[13px] text-white/50">{searching ? "Searching…" : q ? `No town matches “${q}”.` : "No towns listed for this country."}</li>
          )}
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                onMouseEnter={() => onHover?.(c.id)}
                onFocus={() => onHover?.(c.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
                  selectedId === c.id ? "bg-lime/15 text-white ring-1 ring-lime/30" : "text-white/85 hover:bg-white/8",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/6 text-white/60">
                  {c.kind === "capital" ? <Crown className="size-3.5 text-lime" aria-label="Capital" /> : <Building2 className="size-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{c.name}</span>
                  {c.population > 0 && <span className="block text-[11px] text-white/45">{people(c.population)}</span>}
                </span>
              </button>
            </li>
          ))}
          {searching && list.length > 0 && <li className="px-3 py-2 text-[12px] text-white/45">Searching more towns…</li>}
        </ul>
      )}
      {!loading && total !== undefined && total > cities.length && !q && (
        <p className="mt-2 px-1 text-[11px] text-white/40">Showing the {cities.length} largest of {total.toLocaleString()} places. Type to search the rest.</p>
      )}
    </div>
  );
}
