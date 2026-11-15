import { monthName } from "@/shared/lib";
import type { ClimateContext } from "./engine-types";

/**
 * Field calendar: when the field is usually bare, and which months are risky for crops.
 * Transparent rules (no model), from data the field page already loads:
 *   bare  = clear Sentinel-2 NDVI of the month below 0.2 (median of the month's clear views)
 *   frost = the coldest hour of the month was below 0 °C (NASA POWER monthly T2M_MIN)
 *   heat  = the hottest hour of the month reached 40 °C (NASA POWER monthly T2M_MAX is the month's peak)
 *   dry   = NASA POWER rain below half of reference evapotranspiration (ET₀)
 * Months are 1–12.
 */

export const CALENDAR_RULES = {
  bareNdviBelow: 0.2,
  minClearShare: 0.3,
  frostTminBelow: 0,
  heatPeakAtLeast: 40,
  dryRainToEt0Below: 0.5,
  greenNdviAbove: 0.4,
  lowNdviBelow: 0.3,
  weakPeakBelow: 0.5,
} as const;

/** The parts of a Sentinel-2 NDVI period this module reads (matches `NdviPeriod` from entities/ndvi-history). */
export interface NdviObservation {
  from: string;
  ndviMean: number | null;
  clearShare: number;
}

export interface EvidenceLine {
  text: string;
  source: string;
}

export interface MonthFlags {
  month: number;
  /** null = no clear satellite view in this month. */
  bare: boolean | null;
  frost: boolean;
  heat: boolean;
  dry: boolean;
}

export interface FieldCalendar {
  months: MonthFlags[];
  /** e.g. "Bare: Nov–Feb. Frost: Dec–Feb. Hot: Jul. Dry: Jun–Sep." */
  sentence: string;
  bareMonths: number[];
  frostMonths: number[];
  heatMonths: number[];
  dryMonths: number[];
}

/** Field facts the strategy comparison uses as evidence. */
export interface FieldEvidence {
  calendar?: FieldCalendar;
  /** Clear Sentinel-2 views in the last 12 months. */
  clearNdviViews?: number;
  /** Times the field turned green in the last 12 months (≈ crops per year). */
  greenSeasons?: number;
  /** Highest clear NDVI in the last 12 months. */
  peakNdvi?: { value: number; month: number } | null;
  /** Ready-made evidence lines (NDVI history, long-term climate trend, …). */
  evidence?: EvidenceLine[];
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const clearViews = (series: NdviObservation[]) =>
  series
    .filter((p): p is NdviObservation & { ndviMean: number } => p.ndviMean !== null && p.clearShare >= CALENDAR_RULES.minClearShare)
    .sort((a, b) => a.from.localeCompare(b.from));

/** "Nov–Feb, Jul" from month numbers 1–12; consecutive months (also across New Year) are joined. */
export function monthRanges(months: number[]): string {
  const set = new Set(months);
  if (set.size === 0) return "";
  if (set.size === 12) return "all year";
  const runs: Array<[number, number]> = [];
  // Start each run at a month whose previous month is not in the set, so Dec→Jan joins.
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m;
    while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== m) end = end === 12 ? 1 : end + 1;
    runs.push([m, end]);
  }
  return runs.map(([a, b]) => (a === b ? monthName(a - 1) : `${monthName(a - 1)}–${monthName(b - 1)}`)).join(", ");
}

export function fieldCalendar(ctx: ClimateContext, ndvi: NdviObservation[] = []): FieldCalendar {
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const p of clearViews(ndvi)) byMonth[Number(p.from.slice(5, 7)) - 1]?.push(p.ndviMean);

  const months: MonthFlags[] = Array.from({ length: 12 }, (_, i) => {
    const tmin = ctx.monthlyTmin[i];
    const tmax = ctx.monthlyTmax?.[i];
    const rain = ctx.monthlyRain?.[i];
    const et0 = ctx.monthlyEt0?.[i];
    return {
      month: i + 1,
      bare: byMonth[i].length ? median(byMonth[i]) < CALENDAR_RULES.bareNdviBelow : null,
      frost: tmin != null && tmin < CALENDAR_RULES.frostTminBelow,
      heat: tmax != null && tmax >= CALENDAR_RULES.heatPeakAtLeast,
      dry: rain != null && et0 != null && et0 > 0 && rain < CALENDAR_RULES.dryRainToEt0Below * et0,
    };
  });
  const pick = (f: (m: MonthFlags) => boolean) => months.filter(f).map((m) => m.month);
  const bareMonths = pick((m) => m.bare === true);
  const frostMonths = pick((m) => m.frost);
  const heatMonths = pick((m) => m.heat);
  const dryMonths = pick((m) => m.dry);

  const parts = [
    bareMonths.length ? `Bare: ${monthRanges(bareMonths)}.` : "",
    frostMonths.length ? `Frost: ${monthRanges(frostMonths)}.` : "",
    heatMonths.length ? `Hot: ${monthRanges(heatMonths)}.` : "",
    dryMonths.length ? `Dry: ${monthRanges(dryMonths)}.` : "",
  ].filter(Boolean);
  const sentence = parts.length ? parts.join(" ") : "No bare, frost, hot or dry months found in the last 12 months.";
  return { months, sentence, bareMonths, frostMonths, heatMonths, dryMonths };
}

/**
 * Counts how often the field turned green (NDVI rose above 0.4 after being below 0.3),
 * which is roughly the number of crops in the last 12 months.
 */
export function greenSeasons(ndvi: NdviObservation[]): number {
  let count = 0;
  let low = true;
  for (const p of clearViews(ndvi)) {
    if (p.ndviMean < CALENDAR_RULES.lowNdviBelow) low = true;
    else if (p.ndviMean > CALENDAR_RULES.greenNdviAbove && low) {
      count++;
      low = false;
    }
  }
  return count;
}

/** Everything the strategy comparison needs from the field page's data, as one object. */
export function fieldEvidence(ctx: ClimateContext, ndvi: NdviObservation[] = [], extra: EvidenceLine[] = []): FieldEvidence {
  const views = clearViews(ndvi);
  const calendar = fieldCalendar(ctx, ndvi);
  const seasons = greenSeasons(ndvi);
  const best = views.reduce<NdviObservation & { ndviMean: number } | null>((b, p) => (!b || p.ndviMean > b.ndviMean ? p : b), null);
  const peakNdvi = best ? { value: Math.round(best.ndviMean * 100) / 100, month: Number(best.from.slice(5, 7)) } : null;

  const evidence: EvidenceLine[] = [];
  if (views.length) {
    evidence.push({
      text:
        seasons === 0
          ? `Your field never turned green in the last 12 months (highest NDVI ${peakNdvi!.value.toFixed(2)}).`
          : `Your field turned green ${seasons === 1 ? "once" : `${seasons} times`} in the last 12 months, greenest in ${monthName(peakNdvi!.month - 1)} (NDVI ${peakNdvi!.value.toFixed(2)}).`,
      source: "Copernicus Sentinel-2",
    });
  }
  if (calendar.bareMonths.length) evidence.push({ text: `The soil was bare in ${monthRanges(calendar.bareMonths)}.`, source: "Copernicus Sentinel-2" });
  return { calendar, clearNdviViews: views.length, greenSeasons: seasons, peakNdvi, evidence: [...evidence, ...extra] };
}
