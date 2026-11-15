"use client";

import { AlertTriangle, CalendarDays, Flame, Snowflake, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { STRATEGY_DISCLAIMER, type FieldCalendar } from "@/entities/crop";
import { cn, monthName } from "@/shared/lib";
import { Card } from "@/shared/ui";


/** "Supports, not replaces": shown under the rotation strategies (screen and PDF). */
export function StrategyDisclaimer() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{STRATEGY_DISCLAIMER}</p>
    </div>
  );
}

/** The field's year: bare/green months (Sentinel-2), frost, heat and dry months (NASA POWER), and the 20-year trend. */
export function FieldYear({ calendar, trendSentence }: { calendar: FieldCalendar | null; trendSentence: string | null }) {
  return (
    <Card padded={false} className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 text-forest" aria-hidden />
        <h4 className="text-[14px] font-semibold text-ink">Your field’s year</h4>
      </div>
      {calendar && (
        <>
          <div className="overflow-x-auto">
            <ol className="grid min-w-[420px] grid-cols-12 gap-1" aria-label="Month by month">
              {calendar.months.map((m) => (
                <li
                  key={m.month}
                  className={cn("flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5", m.bare ? "bg-[#F4ECDF]" : m.bare === false ? "bg-[#E6F3EA]" : "bg-mist")}
                  title={describeMonth(m)}
                >
                  <span className="text-[10.5px] font-medium text-ink-muted">{monthName(m.month - 1)}</span>
                  <span className="flex h-3.5 items-center gap-0.5" aria-label={describeMonth(m)}>
                    {m.frost && <Snowflake className="size-3 text-info" aria-hidden />}
                    {m.heat && <Flame className="size-3 text-concern" aria-hidden />}
                    {m.dry && <Sun className="size-3 text-watch" aria-hidden />}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-[13px] leading-5 text-ink">{calendar.sentence}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
            <Legend swatch="bg-[#F4ECDF]">Bare soil (Sentinel-2)</Legend>
            <Legend swatch="bg-[#E6F3EA]">Green</Legend>
            <span className="inline-flex items-center gap-1">
              <Snowflake className="size-3 text-info" aria-hidden /> Frost
            </span>
            <span className="inline-flex items-center gap-1">
              <Flame className="size-3 text-concern" aria-hidden /> Heat ≥ 40 °C
            </span>
            <span className="inline-flex items-center gap-1">
              <Sun className="size-3 text-watch" aria-hidden /> Dry (rain &lt; half of evaporation)
            </span>
          </p>
        </>
      )}
      {trendSentence && (
        <p className="border-t border-line pt-3 text-[13px] leading-5 text-ink">
          <span className="font-semibold">20-year climate change: </span>
          {trendSentence} <span className="text-ink-muted">(NASA POWER)</span>
        </p>
      )}
    </Card>
  );
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2.5 rounded-sm", swatch)} aria-hidden /> {children}
    </span>
  );
}

function describeMonth(m: FieldCalendar["months"][number]): string {
  const parts = [m.bare ? "bare soil" : m.bare === false ? "green" : "no clear satellite view"];
  if (m.frost) parts.push("frost");
  if (m.heat) parts.push("heat");
  if (m.dry) parts.push("dry");
  return `${monthName(m.month - 1)}: ${parts.join(", ")}`;
}
