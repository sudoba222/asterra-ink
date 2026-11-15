import { describe, expect, it } from "vitest";
import { climateTrend, type MonthlySeries } from "./climate-trend";

/** Builds 2005–2025 monthly series; `f(year, month0)` gives the value. */
function series(f: (y: number, m: number) => number | null): MonthlySeries {
  const out: MonthlySeries = {};
  for (let y = 2005; y <= 2025; y++) for (let m = 0; m < 12; m++) out[`${y}-${String(m + 1).padStart(2, "0")}`] = f(y, m);
  return out;
}
const SEASON = [2, 4, 9, 14, 19, 24, 27, 26, 21, 14, 8, 3];

describe("climateTrend", () => {
  it("compares the first and last 5 years and gives a per-decade trend", () => {
    const t2m = series((y, m) => SEASON[m] + (y - 2005) * 0.05); // +0.5 °C per decade
    const tmin = series((y, m) => (m < 2 || m === 11) && y < 2015 ? -3 : 2); // 3 frost months early, 0 late
    const rain = series((y) => (y < 2015 ? 1.0 : 0.9)); // mm/day → about 365 then 329 mm/yr
    const tr = climateTrend(t2m, tmin, rain, 2005, 2025);
    expect(tr.meanTemp?.change).toBe(0.8);
    expect(tr.meanTemp?.perDecade).toBe(0.5);
    expect(tr.summerTemp?.change).toBe(0.8);
    expect(tr.annualRain).toMatchObject({ early: 365, late: 329, changePct: -10 });
    expect(tr.annualRain?.wettest.mm).toBe(366); // a leap year before 2015
    expect(tr.annualRain?.wettest.year).toBeLessThan(2015);
    expect(tr.annualRain?.driest.year).toBeGreaterThanOrEqual(2015);
    expect(tr.frostMonths).toEqual({ early: 3, late: 0, change: -3 });
    expect(tr.sentence).toBe("Since 2005–2009: 0.8 °C warmer, summers +0.8 °C, rain −10 %, 3 fewer frost months a year.");
    expect(tr.evidence.map((e) => e.source)).toEqual(Array(5).fill("NASA POWER (2005–2025)"));
  });

  it("skips years with missing months and says when there is not enough history", () => {
    const gaps = series((y, m) => (y > 2007 ? null : SEASON[m]));
    const tr = climateTrend(gaps, gaps, gaps, 2005, 2025);
    expect(tr.meanTemp).toBeNull();
    expect(tr.sentence).toMatch(/Not enough NASA POWER history/);
    expect(tr.evidence).toEqual([]);
  });
});
