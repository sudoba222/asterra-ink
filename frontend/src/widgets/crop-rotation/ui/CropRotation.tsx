"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, ClipboardList, FlaskConical, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { EnvironmentalProfile } from "@/entities/climate";
import {
  CATALOG_VERSION,
  EMPTY_PROFILE,
  WEIGHTS,
  evaluateRotation,
  type CandidateResult,
  type ClimateContext,
  type FarmerProfile,
} from "@/entities/crop";
import { FarmerQuestionnaire } from "@/features/fill-farmer-questionnaire";
import { cn } from "@/shared/lib";
import { Badge, Card } from "@/shared/ui";

function climateContext(p: EnvironmentalProfile): ClimateContext {
  const byMonth = (values: Array<{ month: string; value: number | null }> | undefined) => {
    const buckets: number[][] = Array.from({ length: 12 }, () => []);
    for (const v of values?.slice(-p.period.months) ?? []) {
      if (v.value !== null) buckets[Number(v.month.slice(5)) - 1].push(v.value);
    }
    return buckets.map((b) => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : null));
  };
  return {
    monthlyTemp: byMonth(p.series.temperature?.values),
    monthlyTmin: byMonth(p.series.temperatureMin?.values),
    annualRainfall: p.indicators.precipitation.value,
    status: p.indicators.precipitation.status,
  };
}

const STATUS = {
  suitable: { label: "Passes filters", icon: CheckCircle2, cls: "text-good bg-[#E6F3EA]" },
  caution: { label: "Possible, with cautions", icon: AlertTriangle, cls: "text-watch bg-[#FBF1E0]" },
  excluded: { label: "Filtered out", icon: CircleSlash, cls: "text-ink-muted bg-mist" },
} as const;

export function CropRotation({ profile }: { profile: EnvironmentalProfile }) {
  const [farmer, setFarmer] = useState<FarmerProfile>(EMPTY_PROFILE);
  const ctx = useMemo(() => climateContext(profile), [profile]);
  const result = useMemo(() => evaluateRotation(farmer, ctx), [farmer, ctx]);
  const [showExcluded, setShowExcluded] = useState(false);
  const visible = result.candidates.filter((c) => c.status !== "excluded");
  const excluded = result.candidates.filter((c) => c.status === "excluded");

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <b className="font-semibold">Indicative — not validated agronomic advice.</b> Candidates are filtered with climate data for the analysis point and a
          small crop catalog (v{CATALOG_VERSION}, ranges summarised from FAO ECOCROP, pending agronomy review). Confirm with a local extension service.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="size-4 text-forest" aria-hidden />
            <h3 className="text-[14px] font-semibold text-ink">About your field</h3>
          </div>
          <FarmerQuestionnaire value={farmer} onChange={setFarmer} />
        </Card>

        <div className="space-y-3">
          {(result.notes.length > 0 || result.missingData.length > 0) && (
            <Card tone="mist" className="space-y-3">
              {result.notes.length > 0 && (
                <ul className="space-y-1.5">
                  {result.notes.map((n) => (
                    <li key={n} className="flex gap-2 text-[12.5px] leading-5 text-ink">
                      <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden /> {n}
                    </li>
                  ))}
                </ul>
              )}
              {result.missingData.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Needed for a stronger recommendation</p>
                  <ul className="space-y-1">
                    {result.missingData.map((m) => (
                      <li key={m} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden /> {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <ul className="space-y-2" aria-label="Crop candidates">
            <AnimatePresence initial={false}>
              {visible.map((c, i) => (
                <CandidateRow key={c.crop.id} c={c} rank={i + 1} />
              ))}
            </AnimatePresence>
            {visible.length === 0 && (
              <li className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-[13px] text-ink-muted">
                No catalog crop passes the climate and water filters for these answers. Try marking the field as irrigated, or check the filtered-out list.
              </li>
            )}
          </ul>

          {excluded.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowExcluded((s) => !s)}
                aria-expanded={showExcluded}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] font-medium text-ink-muted hover:text-ink"
              >
                <ChevronDown className={cn("size-4 transition-transform", showExcluded && "rotate-180")} aria-hidden />
                {excluded.length} filtered out
              </button>
              {showExcluded && (
                <ul className="mt-2 space-y-2">
                  {excluded.map((c) => (
                    <CandidateRow key={c.crop.id} c={c} />
                  ))}
                </ul>
              )}
            </div>
          )}

          <details className="group rounded-2xl border border-line bg-surface px-4 py-3 text-[12.5px]">
            <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
              <span className="inline-flex items-center gap-1.5">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> How the ordering works
              </span>
            </summary>
            <p className="mt-2 text-ink-muted">
              Crops failing a hard limit (temperature or rainfall outside tolerated range) are filtered out. The rest are grouped by warnings and ordered by
              these documented points. There is no hidden model and no profit estimate.
            </p>
            <table className="mt-2 w-full">
              <tbody>
                {WEIGHTS.map((w) => (
                  <tr key={w.rule} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink">{w.rule}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{w.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ c, rank }: { c: CandidateResult; rank?: number }) {
  const [open, setOpen] = useState(rank === 1);
  const st = STATUS[c.status];
  const Icon = st.icon;
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className={cn("rounded-2xl border bg-surface", c.status === "excluded" ? "border-line opacity-80" : "border-line shadow-[var(--shadow-card)]")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          {rank && <span className="font-mono text-[12px] text-ink-faint">{String(rank).padStart(2, "0")}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink">{c.crop.name}</span>
            <span className="block text-[11.5px] text-ink-muted">
              {c.crop.familyLabel} · season {c.seasonLabel} · {c.crop.waterNeed} water need
            </span>
          </span>
          <span className={cn("hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium sm:inline-flex", st.cls)}>
            <Icon className="size-3.5" aria-hidden /> {st.label}
          </span>
          <ChevronDown className={cn("size-4 text-ink-faint transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open && (
          <ul className="space-y-1.5 border-t border-line px-4 py-3">
            {c.checks.map((ch, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-5">
                {ch.kind === "pass" && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-label="Pass" />}
                {ch.kind === "warn" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-watch" aria-label="Caution" />}
                {ch.kind === "fail" && <XCircle className="mt-0.5 size-3.5 shrink-0 text-concern" aria-label="Fails" />}
                {ch.kind === "note" && <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-label="Note" />}
                <span className="text-ink">
                  <span className="font-medium text-ink-muted">{ch.rule}: </span>
                  {ch.text}
                </span>
              </li>
            ))}
            <li className="pt-1">
              <Badge tone="neutral">Score {c.score > 0 ? `+${c.score}` : c.score}</Badge>
            </li>
          </ul>
        )}
      </div>
    </motion.li>
  );
}
