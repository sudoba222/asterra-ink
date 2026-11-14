"use client";

import { ChevronRight, Loader2, MousePointerClick } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/lib";
import { Flag } from "@/shared/ui";

interface Props {
  country?: { iso3: string; name: string } | null;
  /** City, district or region — the most specific place chosen so far. */
  place?: string | null;
  /** Shown when nothing is chosen yet, or next to a hovered country. */
  hint?: string | null;
  busy?: boolean;
  /** Hovered (not yet chosen) country: rendered lighter. */
  preview?: boolean;
  className?: string;
}

/** Always-visible "where am I choosing" pill over the globe: flag · country › city. */
export function LocationBadge({ country, place, hint, busy = false, preview = false, className }: Props) {
  const key = `${country?.iso3 ?? "none"}-${place ?? ""}-${preview}`;
  return (
    <div className={cn("pointer-events-none flex justify-center", className)} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "glass flex max-w-full min-w-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-2 text-[13px] text-white shadow-[var(--shadow-float)]",
            preview && "text-white/80",
          )}
        >
          {country ? (
            <Flag iso3={country.iso3} name={country.name} className="ml-1 h-3.5 w-5" />
          ) : (
            <span className="grid size-6 place-items-center rounded-full bg-lime/15 text-lime">
              <MousePointerClick className="size-3.5" aria-hidden />
            </span>
          )}
          {country && <span className="truncate font-semibold">{country.name}</span>}
          {country && place && (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-white/40" aria-hidden />
              <span className="truncate font-medium text-lime">{place}</span>
            </>
          )}
          {hint && <span className={cn("truncate", country ? "text-white/55" : "text-white/80")}>{country ? `· ${hint}` : hint}</span>}
          {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-lime" aria-label="Loading" />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
