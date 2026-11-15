import type { DayObservation } from "../model/types";

export interface HistorySummary {
  /** Days in the window (with or without data). */
  days: number;
  from: string | null;
  to: string | null;
  /** Sum of daily rain, mm (null when no day reported rain). */
  rainMm: number | null;
  rainyDays: number;
  /** Mean of daily mean temperature, °C. */
  meanTempC: number | null;
  /** Lowest daily minimum / highest daily maximum, °C. */
  minTempC: number | null;
  maxTempC: number | null;
  /** Sum of reference evapotranspiration, mm. */
  et0Mm: number | null;
  /** Most recent root-zone wetness reading, % of saturation. */
  latestWetness: number | null;
}

const RAINY_DAY_MM = 1;

function nums(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

const sum = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) : null);

/** One-line facts about the observed window (missing values are skipped, never treated as 0). */
export function summariseHistory(history: DayObservation[]): HistorySummary {
  const rain = nums(history.map((d) => d.rain));
  const temp = nums(history.map((d) => d.t2m));
  const tMin = nums(history.map((d) => d.tMin));
  const tMax = nums(history.map((d) => d.tMax));
  const wet = nums(history.map((d) => d.wetness));
  const meanTemp = sum(temp);
  return {
    days: history.length,
    from: history[0]?.date ?? null,
    to: history.at(-1)?.date ?? null,
    rainMm: sum(rain),
    rainyDays: rain.filter((r) => r >= RAINY_DAY_MM).length,
    meanTempC: meanTemp === null ? null : meanTemp / temp.length,
    minTempC: tMin.length ? Math.min(...tMin) : null,
    maxTempC: tMax.length ? Math.max(...tMax) : null,
    et0Mm: sum(nums(history.map((d) => d.et0))),
    latestWetness: wet.at(-1) ?? null,
  };
}
