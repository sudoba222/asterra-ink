import type { NdviPeriod } from "../model/types";

/** Below this, a period is bare soil (before planting, after harvest, or fallow). */
export const BARE_SOIL_NDVI = 0.2;
/** Periods where less of the field than this was seen through clouds are left out. */
export const MIN_CLEAR_SHARE = 0.3;

export interface NdviPoint {
  date: string;
  ndvi: number;
}

export interface NdviSummary {
  /** Clear periods, oldest first, NDVI rounded to 2 decimals. */
  points: NdviPoint[];
  latest: NdviPoint | null;
  peak: NdviPoint | null;
  barePeriods: number;
  /** How many periods were too cloudy (or missing a value) to use. */
  cloudyPeriods: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Turns the backend series into what the dashboard shows. Cloudy periods are dropped, never drawn as 0. */
export function summarizeNdvi(series: NdviPeriod[]): NdviSummary {
  const points = series
    .filter((p): p is NdviPeriod & { ndviMean: number } => p.ndviMean !== null && p.clearShare >= MIN_CLEAR_SHARE)
    .map((p) => ({ date: p.from, ndvi: round2(p.ndviMean) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const peak = points.reduce<NdviPoint | null>((best, p) => (!best || p.ndvi > best.ndvi ? p : best), null);
  return {
    points,
    latest: points.at(-1) ?? null,
    peak,
    barePeriods: points.filter((p) => p.ndvi < BARE_SOIL_NDVI).length,
    cloudyPeriods: series.length - points.length,
  };
}
