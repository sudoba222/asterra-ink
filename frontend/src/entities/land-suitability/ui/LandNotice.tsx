"use client";

import { AlertTriangle, Building2, ChevronDown, Construction, MapPinOff, Snowflake, Waves, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/shared/lib";
import type { LandReason, LandSuitability } from "../model/types";

const ICON: Partial<Record<LandReason, LucideIcon>> = {
  building_detected: Building2,
  built_up_area_detected: Building2,
  water_detected: Waves,
  infrastructure_detected: Construction,
  non_agricultural_land_use: MapPinOff,
};

const PREFIX = "Crop recommendations are unavailable.";

/**
 * The land check, for the farmer. Unsuitable land → a prominent card that replaces crop advice.
 * Uncertain land → a caution banner. Suitable land renders nothing (its notes go with the crop plan).
 */
export function LandNotice({ land, className }: { land: LandSuitability; className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (land.status === "suitable") return null;

  if (land.status === "unsuitable_land") {
    const snow = land.reason === "non_agricultural_land_use" && (land.worldCover?.shares.snowIce ?? 0) >= 0.5;
    const Icon = snow ? Snowflake : (ICON[land.reason ?? "non_agricultural_land_use"] ?? MapPinOff);
    const detail = land.message.startsWith(PREFIX) ? land.message.slice(PREFIX.length).trim() : land.message;
    return (
      <section aria-labelledby={titleId} role="status" className={cn("relative overflow-hidden rounded-[24px] bg-[#5B2A12] p-5 text-white shadow-[var(--shadow-card)] sm:p-6", className)}>
        <p className="text-[11.5px] font-medium tracking-wide text-white/70">Land check</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-white/12">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-[19px] leading-snug font-semibold text-balance sm:text-[21px]">
              Crop recommendations are unavailable
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-white/85">{detail}</p>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] leading-5 text-white/65">If this is wrong, edit the field outline so it covers only the ground you cultivate.</p>
        <Why land={land} open={open} onToggle={() => setOpen((o) => !o)} dark />
      </section>
    );
  }

  return (
    <div role="status" className={cn("rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]", className)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <b className="font-semibold">We couldn’t confirm this is farmland.</b> {land.message}
        </p>
      </div>
      <Why land={land} open={open} onToggle={() => setOpen((o) => !o)} />
    </div>
  );
}

function Why({ land, open, onToggle, dark }: { land: LandSuitability; open: boolean; onToggle: () => void; dark?: boolean }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium",
          dark ? "bg-white/10 hover:bg-white/16" : "bg-[#F3E6CC] hover:bg-[#EEDCB8]",
        )}
      >
        Why? <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className={cn("mt-3 rounded-2xl p-3.5 text-[13px] leading-5", dark ? "bg-black/15 text-white/85" : "bg-white/60 text-[#5A3E10]")}>
          <ul className="space-y-1">
            {land.evidence.map((e) => (
              <li key={e}>• {e}</li>
            ))}
            {land.sources
              .filter((s) => !s.ok)
              .map((s) => (
                <li key={s.id}>
                  • {s.name.split(" — ")[0]}: {s.detail}
                </li>
              ))}
          </ul>
          <p className={cn("mt-2 text-[11.5px]", dark ? "text-white/55" : "text-[#8A6A30]")}>
            Checked across the whole outline with ESA WorldCover 10 m land cover and OpenStreetMap — not from climate data.
          </p>
        </div>
      )}
    </div>
  );
}
