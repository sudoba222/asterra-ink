"use client";

import {
  AlertTriangle,
  ArrowDown,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Droplet,
  Flame,
  HelpCircle,
  Info,
  Leaf,
  Snowflake,
  Sprout,
  Sun,
  Target,
  Wheat,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cropById, type FieldCalendar, type PlannedSeason, type RotationStrategy } from "@/entities/crop";
import { cn, monthName } from "@/shared/lib";
import { Badge, Card } from "@/shared/ui";
import { CropThumb, MetaChip } from "./CropRotation";

const CONFIDENCE = {
  high: "bg-[#E6F3EA] text-[#1F6B43] ring-good/15",
  medium: "bg-[#FBF1E0] text-[#8A5A12] ring-watch/20",
  low: "bg-[#FDECE2] text-[#9A3412] ring-concern/15",
} as const;

const WATER = { low: "Low", medium: "Medium", high: "High", unknown: "—" } as const;

export const DISCLAIMER =
  "ASTERRA suggests options from satellite and climate data. It does not replace your own experience or a local agronomist. Check the points marked “Check locally” before you change your rotation.";

interface Props {
  strategies: RotationStrategy[];
  calendar?: FieldCalendar | null;
  /** e.g. "Since 2005–2009: 0.8 °C warmer, …" (NASA POWER 20-year trend). */
  trendSentence?: string | null;
  /** True while satellite evidence (NDVI, SMAP, slope, GRACE, trend) is still loading. */
  loadingEvidence?: boolean;
}

/** Three rotation plans side by side, the field's year, a comparison table and the disclaimer. Same visual language as CropRotation. */
export function RotationStrategies({ strategies, calendar, trendSentence, loadingEvidence }: Props) {
  return (
    <section aria-labelledby="rotation-plans" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-2">
        <h3 id="rotation-plans" className="text-[16px] font-semibold text-ink">
          Compare 3 rotation plans
        </h3>
        <p className="text-[12px] text-ink-muted">Next three seasons · rules and NASA data, no black box</p>
      </div>

      {(calendar || trendSentence) && <FieldYear calendar={calendar ?? null} trendSentence={trendSentence ?? null} />}

      {loadingEvidence && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <Info className="size-3.5 shrink-0 text-info" aria-hidden /> Loading more satellite evidence for your field (NDVI, SMAP, slope, GRACE)…
        </p>
      )}

      <div className="@container">
        <ul className="grid grid-cols-1 items-start gap-3 @min-[60rem]:grid-cols-3" aria-label="Rotation plans">
          {strategies.map((s) => (
            <li key={s.id}>
              <StrategyCard s={s} />
            </li>
          ))}
        </ul>
      </div>

      <ComparisonTable strategies={strategies.filter((s) => s.available)} />

      <div className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{DISCLAIMER}</p>
      </div>
    </section>
  );
}

function FieldYear({ calendar, trendSentence }: { calendar: FieldCalendar | null; trendSentence: string | null }) {
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

function StrategyCard({ s }: { s: RotationStrategy }) {
  if (!s.available) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-5">
        <h4 className="text-[16px] font-semibold text-ink">{s.title}</h4>
        <p className="mt-2 text-[13px] leading-5 text-ink-muted">{s.unavailableReason}</p>
      </div>
    );
  }
  return (
    <article className={cn("rounded-2xl border bg-surface p-4 shadow-sm @min-[24rem]:p-5", s.fitsGoal ? "border-forest/40 ring-1 ring-forest/20" : "border-black/5")}>
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-[17px] leading-6 font-semibold text-ink">{s.title}</h4>
        {s.fitsGoal && (
          <Badge tone="lime" className="gap-1">
            <Target className="size-3" aria-hidden /> Fits your goal
          </Badge>
        )}
      </header>

      <ol className="mt-4 space-y-1" aria-label={`${s.title}: three seasons`}>
        {s.seasons.map((season, i) => (
          <li key={`${season.cropId}-${i}`}>
            {i > 0 && <ArrowDown className="my-0.5 ml-[18px] size-3.5 text-ink-faint" aria-hidden />}
            <SeasonRow season={season} index={i} />
          </li>
        ))}
      </ol>

      <p className={cn("mt-4 inline-flex max-w-full items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] leading-4 ring-1 ring-inset", CONFIDENCE[s.confidence])}>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Confidence: </span>
          {s.confidenceReason}
        </span>
      </p>

      <Block title="Why suggested" items={s.why} icon={<HelpCircle className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />} />
      <Block title="Benefits" items={s.benefits} icon={<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />} />
      <Block title="Check locally" items={s.checkLocally} icon={<AlertTriangle className="mt-0.5 size-4 shrink-0 text-watch" aria-hidden />} />
      <Fold title={`Evidence (${s.evidence.length})`}>
        <ul className="space-y-2">
          {s.evidence.map((e) => (
            <li key={e.text} className="flex gap-2.5 text-[13px] leading-[1.55]">
              <Leaf className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
              <p className="min-w-0">
                <span className="text-ink">{e.text}</span> <span className="text-ink-muted">· {e.source}</span>
              </p>
            </li>
          ))}
        </ul>
      </Fold>
      <Fold title={`What we don’t know (${s.gaps.length})`}>
        <ul className="space-y-1">
          {s.gaps.map((g) => (
            <li key={g} className="flex gap-2 text-[12.5px] leading-5 text-ink-muted">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden /> {g}
            </li>
          ))}
        </ul>
      </Fold>
    </article>
  );
}

function SeasonRow({ season, index }: { season: PlannedSeason; index: number }) {
  const crop = cropById(season.cropId);
  const months = `${monthName(season.plantMonth - 1)} – ${monthName(season.harvestMonth - 1)}`;
  return (
    <div className="flex items-center gap-3">
      <CropThumb id={season.cropId} name={season.cropName} muted={false} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Season {index + 1}</p>
        <p className="truncate text-[14.5px] leading-5 font-semibold text-ink">{season.cropName}</p>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <MetaChip icon={CalendarDays} srLabel="Season">
            {months}
          </MetaChip>
          {crop && (
            <MetaChip icon={crop.family === "Poaceae" ? Wheat : Sprout} srLabel="Family">
              {crop.familyLabel}
            </MetaChip>
          )}
          {crop && (
            <MetaChip icon={Droplet} srLabel="Water need">
              {`${WATER[crop.waterNeed]} water`}
            </MetaChip>
          )}
        </span>
      </div>
    </div>
  );
}

function Block({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 border-t border-black/5 pt-3">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-[13px] leading-[1.55] text-ink">
            {icon}
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Collapsible block with the same grid-rows animation as the crop cards. */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-3 border-t border-black/5 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[12.5px] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronDown className={cn("size-4 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        {title}
      </button>
      <div id={id} inert={!open} className={cn("grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 pb-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** "5 · water, heat, dry months": the number of flags and their kinds (flags look like "Crop: kind"). */
function riskSummary(flags: string[]): string {
  if (!flags.length) return "None";
  const kinds = [...new Set(flags.map((f) => f.split(": ").pop() ?? f))];
  return `${flags.length} · ${kinds.join(", ")}`;
}

function ComparisonTable({ strategies }: { strategies: RotationStrategy[] }) {
  if (strategies.length < 2) return null;
  const rows: Array<{ label: string; value: (s: RotationStrategy) => ReactNode; hint: string }> = [
    { label: "Water use", value: (s) => WATER[s.metrics.water], hint: "Average water need of the three crops" },
    { label: "Legume seasons", value: (s) => s.metrics.legumeSeasons, hint: "Seasons that add nitrogen" },
    { label: "Same family back to back", value: (s) => s.metrics.familyRepeats, hint: "0 is best: pests and soil diseases build up" },
    { label: "Seasons in the ideal climate", value: (s) => `${s.metrics.climateFitSeasons} of ${s.seasons.length}`, hint: "Season temperature in the crop’s optimal range" },
    { label: "Bare months between crops", value: (s) => s.metrics.bareMonths, hint: "Bare soil erodes and loses organic matter" },
    { label: "Risk flags", value: (s) => riskSummary(s.metrics.riskFlags), hint: "Details in each plan’s “Check locally”" },
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <caption className="sr-only">Rotation plans compared</caption>
        <thead>
          <tr className="text-left">
            <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Compared</th>
            {strategies.map((s) => (
              <th key={s.id} className="px-4 py-2.5 text-[12.5px] font-semibold text-ink">
                {s.title}
                {s.fitsGoal && <Target className="ml-1 inline size-3 text-forest" aria-label="Fits your goal" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line align-top">
              <th scope="row" className="px-4 py-2 text-left font-normal">
                <span className="text-ink">{r.label}</span>
                <span className="block text-[11px] text-ink-faint">{r.hint}</span>
              </th>
              {strategies.map((s) => (
                <td key={s.id} className={cn("px-4 py-2 text-ink", r.label !== "Risk flags" && "font-mono tabular-nums")}>
                  {r.value(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
