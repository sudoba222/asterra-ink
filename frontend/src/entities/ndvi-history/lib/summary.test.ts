import { describe, expect, it } from "vitest";
import type { NdviPeriod } from "../model/types";
import { summarizeNdvi } from "./summary";

const period = (from: string, ndviMean: number | null, clearShare = 1): NdviPeriod => ({
  from,
  to: from,
  ndviMean,
  ndviMin: null,
  ndviMax: null,
  ndviStd: null,
  clearShare,
});

describe("summarizeNdvi", () => {
  it("drops cloudy periods instead of drawing them as 0", () => {
    const s = summarizeNdvi([period("2025-04-01", 0.1723), period("2025-04-16", null, 0), period("2025-05-01", 0.6, 0.2)]);
    expect(s.points).toEqual([{ date: "2025-04-01", ndvi: 0.17 }]);
    expect(s.cloudyPeriods).toBe(2);
  });

  it("finds the latest clear value, the peak and bare-soil periods", () => {
    const s = summarizeNdvi([period("2025-06-01", 0.25), period("2025-04-01", 0.15), period("2025-05-01", 0.72), period("2025-07-01", 0.18)]);
    expect(s.points.map((p) => p.date)).toEqual(["2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01"]);
    expect(s.latest).toEqual({ date: "2025-07-01", ndvi: 0.18 });
    expect(s.peak).toEqual({ date: "2025-05-01", ndvi: 0.72 });
    expect(s.barePeriods).toBe(2);
  });

  it("handles a year of clouds", () => {
    const s = summarizeNdvi([period("2025-01-01", null, 0)]);
    expect(s).toEqual({ points: [], latest: null, peak: null, barePeriods: 0, cloudyPeriods: 1 });
  });
});
