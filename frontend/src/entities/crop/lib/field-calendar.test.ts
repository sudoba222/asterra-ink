import { describe, expect, it } from "vitest";
import { TEMPERATE } from "./__fixtures__/rotation-scenarios";
import { fieldCalendar, fieldEvidence, greenSeasons, monthRanges } from "./field-calendar";

const view = (from: string, ndviMean: number | null, clearShare = 1) => ({ from, ndviMean, clearShare });

describe("monthRanges", () => {
  it("joins consecutive months, also across New Year", () => {
    expect(monthRanges([11, 12, 1, 2])).toBe("Nov–Feb");
    expect(monthRanges([7])).toBe("Jul");
    expect(monthRanges([1, 2, 6, 7, 8])).toBe("Jan–Feb, Jun–Aug");
    expect(monthRanges([])).toBe("");
  });
});

describe("fieldCalendar", () => {
  it("finds bare months from clear Sentinel-2 views only", () => {
    const cal = fieldCalendar(TEMPERATE, [view("2026-01-01", 0.1), view("2026-01-11", 0.15), view("2026-06-01", 0.7), view("2026-07-01", 0.05, 0.1), view("2026-08-01", null, 0)]);
    expect(cal.bareMonths).toEqual([1]);
    expect(cal.months[6].bare).toBeNull(); // only a cloudy view in July
    expect(cal.months[5].bare).toBe(false);
  });

  it("flags frost, heat and dry months from NASA POWER", () => {
    const ctx = { ...TEMPERATE, monthlyTmax: [15, 17, 22, 28, 34, 39, 44, 40, 34, 28, 20, 16], monthlyRain: [50, 50, 50, 40, 30, 10, 5, 5, 20, 50, 60, 60], monthlyEt0: [10, 20, 45, 75, 110, 140, 160, 140, 95, 50, 20, 10] };
    const cal = fieldCalendar(ctx);
    expect(cal.frostMonths).toEqual([1, 2, 3, 11, 12]);
    expect(cal.heatMonths).toEqual([7, 8]);
    expect(cal.dryMonths).toEqual([5, 6, 7, 8, 9]); // April: 40 mm rain ≥ half of 75 mm ET₀
    expect(cal.sentence).toBe("Frost: Nov–Mar. Hot: Jul–Aug. Dry: May–Sep.");
  });

  it("says so when nothing is flagged", () => {
    const mild = { ...TEMPERATE, monthlyTmin: TEMPERATE.monthlyTmin.map(() => 5) };
    expect(fieldCalendar(mild).sentence).toMatch(/^No bare, frost, hot or dry months/);
  });
});

describe("greenSeasons and fieldEvidence", () => {
  it("counts each time the field turns green after being bare", () => {
    const series = [0.1, 0.5, 0.6, 0.2, 0.15, 0.55, 0.3].map((v, i) => view(`2026-${String(i + 1).padStart(2, "0")}-01`, v));
    expect(greenSeasons(series)).toBe(2);
    const ev = fieldEvidence(TEMPERATE, series);
    expect(ev.clearNdviViews).toBe(7);
    expect(ev.peakNdvi).toEqual({ value: 0.6, month: 3 });
    expect(ev.evidence?.[0].text).toMatch(/turned green 2 times.*greenest in Mar \(NDVI 0\.60\)/);
  });
});
