import { describe, expect, it } from "vitest";
import type { ConditionInputs, DayObservation, ForecastDay } from "../model/types";
import { assessField } from "./assess";

function days(n: number, o: Partial<DayObservation>): DayObservation[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    t2m: 25,
    tMax: 32,
    tMin: 18,
    rain: 0,
    wetness: 50,
    et0: 5,
    ...o,
  }));
}
const fc = (o: Partial<ForecastDay> = {}): ForecastDay[] =>
  ["2026-07-15", "2026-07-16", "2026-07-17"].map((date) => ({ date, rain: 0, tMax: 30, tMin: 18, et0: 5, ...o }));
const input = (o: Partial<ConditionInputs>): ConditionInputs => ({ history: days(14, {}), forecast: fc(), ndvi: null, ndviLastYear: null, ...o });

describe("irrigation and recommendation rules", () => {
  it("dry soil + no rain → irrigate within 24 h", () => {
    const a = assessField(input({ history: days(14, { wetness: 22 }) }));
    expect(a.irrigation.label).toBe("Needed now");
    expect(a.recommendation.title).toMatch(/Irrigate your field within the next 24 hours/);
    expect(a.soil.label).toBe("Dry");
  });

  it("dry soil but rain coming → no irrigation, rain message", () => {
    const a = assessField(input({ history: days(14, { wetness: 22 }), forecast: fc({ rain: 4 }) }));
    expect(a.irrigation.label).toBe("Not needed");
    expect(a.recommendation.title).toMatch(/Rain is expected/);
  });

  it("a bit dry with a weekly deficit → irrigate soon", () => {
    const a = assessField(input({ history: days(14, { wetness: 40, rain: 0, et0: 5 }) }));
    expect(a.irrigation.label).toBe("Soon");
    expect(a.recommendation.level).toBe("watch");
  });

  it("cold season → not needed, no frost alarm", () => {
    const a = assessField(input({ history: days(14, { t2m: 1, wetness: 25 }), forecast: fc({ tMin: -4, tMax: 3 }) }));
    expect(a.irrigation.value).toBe("Cold season");
    expect(a.recommendation.title).toMatch(/cold season/i);
  });

  it("frost in the growing season takes priority", () => {
    const a = assessField(input({ forecast: fc({ tMin: -1 }) }));
    expect(a.recommendation.level).toBe("alert");
    expect(a.recommendation.title).toMatch(/Frost/);
  });

  it("heat alert", () => {
    const a = assessField(input({ forecast: fc({ tMax: 38 }) }));
    expect(a.recommendation.title).toMatch(/Very hot/);
  });

  it("greenness drop vs last year → check the field", () => {
    const a = assessField(input({
      ndvi: { mean: 0.35, pixels: 4, smallerThanPixel: false, date: "2026-07-10" },
      ndviLastYear: { mean: 0.6, pixels: 4, smallerThanPixel: false, date: "2025-07-10" },
    }));
    expect(a.crop.label).toBe("Fair");
    expect(a.recommendation.title).toMatch(/less green than last year/);
  });

  it("missing sources → unknown cards, never invented numbers", () => {
    const a = assessField({ history: [], forecast: [], ndvi: null, ndviLastYear: null });
    for (const c of [a.temperature, a.soil, a.crop, a.irrigation]) {
      expect(c.level).toBe("unknown");
      expect(c.value).toBe("—");
    }
    expect(a.recommendation.level).toBe("unknown");
  });

  it("never says 'good' when soil data is missing", () => {
    const a = assessField(input({ history: [] }));
    expect(a.recommendation.level).toBe("unknown");
    expect(a.recommendation.title).toMatch(/can’t advise on watering/);
    expect(a.temperature.level).not.toBe("unknown"); // forecast still shown
  });

  it("dry soil but last week's rain exceeded demand → check soon, not 'now'", () => {
    const a = assessField(input({ history: days(14, { wetness: 28, rain: 3, et0: 1.8 }) }));
    expect(a.irrigation.label).toBe("Check soon");
    expect(a.recommendation.level).toBe("watch");
  });

  it("dry soil but very low water demand → check soon", () => {
    const a = assessField(input({ history: days(14, { wetness: 28, rain: 0, et0: 1 }), forecast: fc({ et0: 1 }) }));
    expect(a.irrigation.label).toBe("Check soon");
  });

  it("no visible crop → no irrigation, pre-sowing advice", () => {
    const a = assessField(input({
      history: days(14, { wetness: 28 }),
      ndvi: { mean: 0.17, pixels: 4, smallerThanPixel: false, date: "2026-07-10" },
    }));
    expect(a.irrigation.value).toBe("No crop seen");
    expect(a.crop.label).toBe("Little or no crop");
    expect(a.crop.level).toBe("neutral");
    expect(a.recommendation.title).toMatch(/No growing crop is visible/);
    expect(a.recommendation.title).toMatch(/watering before sowing/);
  });

  it("no crop + missing soil data → no claim about soil moisture", () => {
    const a = assessField({ history: [], forecast: [], ndvi: { mean: 0.17, pixels: 4, smallerThanPixel: false, date: "2026-07-10" }, ndviLastYear: null });
    expect(a.recommendation.title).not.toMatch(/enough moisture|dry side/);
    expect(a.recommendation.title).toMatch(/Check the soil moisture by hand/);
  });

  it("good conditions → no action", () => {
    const a = assessField(input({ history: days(14, { wetness: 60, rain: 6 }) }));
    expect(a.recommendation.title).toMatch(/Conditions look good/);
  });
});
