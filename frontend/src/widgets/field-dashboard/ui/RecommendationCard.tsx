"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Info, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Recommendation } from "@/entities/field-conditions";
import { cn } from "@/shared/lib";

const ICON = { alert: AlertTriangle, watch: AlertTriangle, good: CheckCircle2, neutral: Info, unknown: CircleHelp } as const;

/** The single most important piece of advice, with an optional "Why?" explanation. */
export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[rec.level];
  return (
    <section
      aria-labelledby="rec-title"
      className={cn(
        "relative overflow-hidden rounded-[24px] p-5 text-white shadow-[var(--shadow-card)] sm:p-6",
        rec.level === "alert" ? "bg-[#7A2E0A]" : rec.level === "watch" ? "bg-[#6B4A12]" : "bg-forest",
      )}
    >
      <div aria-hidden className="absolute -top-20 -right-16 size-56 rounded-full bg-lime/10 blur-2xl" />
      <p className="relative inline-flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-lime/90">
        <Sparkles className="size-3.5" aria-hidden /> Smart recommendation
      </p>
      <div className="relative mt-3 flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-white/12">
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 id="rec-title" className="text-[19px] leading-snug font-semibold text-balance sm:text-[21px]">
          {rec.title}
        </h2>
      </div>
      {rec.reasons.length > 0 && (
        <div className="relative mt-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-medium hover:bg-white/16"
          >
            Why? <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="mt-3 rounded-2xl bg-black/15 p-3.5 text-[13px] leading-5 text-white/85">
              <ul className="space-y-1">
                {rec.reasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-white/55">Made by simple, transparent rules from NASA data and the weather forecast — not a chatbot.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
