import { describe, expect, it } from "vitest";
import type { DayObservation } from "../model/types";
import { summariseHistory } from "./summary";

const day = (date: string, d: Partial<DayObservation>): DayObservation => ({
  date,
  t2m: null,
  tMax: null,
  tMin: null,
  rain: null,
  wetness: null,
  et0: null,
  ...d,
});

describe("summariseHistory", () => {
  it("sums, averages and finds extremes while skipping missing values", () => {
    const s = summariseHistory([
      day("2026-11-01", { t2m: 10, tMin: 4, tMax: 15, rain: 0, wetness: 40, et0: 2 }),
      day("2026-11-02", { t2m: 14, tMin: 6, tMax: 21, rain: 12.5, wetness: 55, et0: 3 }),
      day("2026-11-03", { t2m: null, rain: 0.4, wetness: null }),
    ]);
    expect(s).toMatchObject({ days: 3, from: "2026-11-01", to: "2026-11-03", rainyDays: 1, meanTempC: 12, minTempC: 4, maxTempC: 21, et0Mm: 5, latestWetness: 55 });
    expect(s.rainMm).toBeCloseTo(12.9);
  });

  it("reports unknowns as null, not zero", () => {
    const s = summariseHistory([day("2026-11-01", {})]);
    expect(s).toMatchObject({ rainMm: null, meanTempC: null, minTempC: null, maxTempC: null, et0Mm: null, latestWetness: null, rainyDays: 0 });
  });

  it("handles an empty window", () => {
    expect(summariseHistory([])).toMatchObject({ days: 0, from: null, to: null });
  });
});
