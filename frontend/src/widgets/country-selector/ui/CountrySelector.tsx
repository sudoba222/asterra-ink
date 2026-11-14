"use client";

import { Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { REGIONS, searchCountries, type Country } from "@/entities/country";
import { useExploration } from "@/entities/exploration";
import { useSelectCountry } from "@/features/select-country";
import { cn } from "@/shared/lib";
import { Flag } from "@/shared/ui";

interface Props {
  tone?: "dark" | "light";
  autoFocus?: boolean;
  onSelected?: (c: Country) => void;
  className?: string;
  listClassName?: string;
}

/**
 * Searchable country browser: type to filter (name, ISO code, alt spellings),
 * filter by region, arrow keys + Enter to choose, Esc to clear.
 */
export function CountrySelector({ tone = "dark", autoFocus, onSelected, className, listClassName }: Props) {
  const { countries } = useExploration();
  const select = useSelectCountry();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const dark = tone === "dark";

  const results = useMemo(() => searchCountries(countries, query, region), [countries, query, region]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (c: Country) => {
    select(c.iso3);
    onSelected?.(c);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(results.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[activeIndex];
      if (c) choose(c);
    } else if (e.key === "Escape") {
      if (query) {
        e.stopPropagation();
        setQuery("");
        setActive(0);
      }
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <label className="relative block">
        <span className="sr-only">Search countries</span>
        <Search className={cn("pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2", dark ? "text-white/45" : "text-ink-faint")} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? `${listId}-${results[activeIndex].iso3}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search a country…"
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "h-11 w-full rounded-xl pr-9 pl-10 text-[14px] outline-none transition",
            dark
              ? "bg-white/8 text-white placeholder:text-white/40 ring-1 ring-white/10 focus:bg-white/10 focus:ring-lime/60"
              : "bg-mist text-ink placeholder:text-ink-faint ring-1 ring-line focus:bg-white focus:ring-forest/40",
          )}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className={cn("absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full", dark ? "text-white/50 hover:bg-white/10" : "text-ink-faint hover:bg-line")}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </label>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by region">
        {[null, ...REGIONS].map((r) => {
          const on = region === r;
          return (
            <button
              key={r ?? "all"}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setRegion(r);
                setActive(0);
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                on
                  ? dark
                    ? "bg-lime text-deep"
                    : "bg-forest text-white"
                  : dark
                    ? "bg-white/6 text-white/65 hover:bg-white/12 hover:text-white"
                    : "bg-mist text-ink-muted hover:bg-line hover:text-ink",
              )}
            >
              {r ?? "All"}
            </button>
          );
        })}
      </div>

      <p className={cn("mt-2 mb-1 px-1 text-[11px]", dark ? "text-white/40" : "text-ink-faint")} aria-live="polite">
        {results.length} {results.length === 1 ? "country" : "countries"}
      </p>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Countries"
        className={cn("min-h-0 flex-1 overflow-y-auto pr-1", dark ? "scroll-quiet-dark" : "scroll-quiet", listClassName)}
      >
        {results.length === 0 && (
          <li className={cn("px-3 py-8 text-center text-[13px]", dark ? "text-white/50" : "text-ink-muted")}>
            No country matches “{query}”.
          </li>
        )}
        {results.map((c, i) => {
          const isActive = i === activeIndex;
          return (
            <motion.li
              key={c.iso3}
              id={`${listId}-${c.iso3}`}
              role="option"
              aria-selected={isActive}
              data-index={i}
              initial={i < 14 ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i < 14 ? 0.02 * i : 0, duration: 0.25 }}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => choose(c)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                isActive && (dark ? "bg-white/8" : "bg-mist"),
              )}
            >
              <Flag iso3={c.iso3} name={c.name} className="h-[18px] w-[27px]" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13.5px] font-medium", dark ? "text-white" : "text-ink")}>{c.name}</span>
                <span className={cn("block truncate text-[11.5px]", dark ? "text-white/45" : "text-ink-faint")}>{c.subregion || c.region}</span>
              </span>
              <span className={cn("font-mono text-[10.5px]", dark ? "text-white/30" : "text-ink-faint")}>{c.iso3}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
