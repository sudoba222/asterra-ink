import { describe, expect, it } from "vitest";
import { TEMPERATE, profile } from "./__fixtures__/rotation-scenarios";
import { compareStrategies, type RotationStrategy } from "./compare-strategies";
import { bareMonthsAfter, comparisonRows, confidenceExplanation, seasonWindow } from "./describe-strategy";
import { MOCK_ROTATION_STRATEGIES } from "./mock-rotation-strategies";
import { getStrategyComparison } from "./strategy-comparison-source";

const byId = (id: RotationStrategy["id"]) => MOCK_ROTATION_STRATEGIES.find((s) => s.id === id)!;

describe("comparisonRows", () => {
  it("has exactly the six agreed criteria, one cell per strategy", () => {
    const rows = comparisonRows(MOCK_ROTATION_STRATEGIES);
    expect(rows.map((r) => r.criterion)).toEqual(["Water", "Nitrogen", "Pest-cycle break", "Climate fit", "Bare months", "Risks"]);
    for (const r of rows) expect(r.cells).toHaveLength(3);
  });

  it("words the metrics for farmers", () => {
    const [water, nitrogen, pests, climate, bare, risks] = comparisonRows([byId("current"), byId("soil")]);
    expect(water.cells.map((c) => c?.label)).toEqual(["High use", "Medium use"]);
    expect(nitrogen.cells[0]).toMatchObject({ signal: "watch", label: "No legume" });
    expect(nitrogen.cells[1]).toMatchObject({ signal: "good", detail: "Legume in 1 season (Soybean)" });
    expect(pests.cells[0]).toMatchObject({ signal: "concern", detail: "Same family back to back 3 times" });
    expect(climate.cells.map((c) => c?.label)).toEqual(["2 of 3 seasons", "3 of 3 seasons"]);
    expect(bare.cells[0]).toMatchObject({ signal: "watch", label: "3 months" });
    expect(risks.cells[1]).toMatchObject({ label: "1 risk", detail: "Sunflower: drainage" });
  });

  it("leaves an unavailable strategy's cells empty", () => {
    const unavailable = compareStrategies(profile({}), TEMPERATE).find((s) => s.id === "current")!;
    expect(unavailable.available).toBe(false);
    for (const r of comparisonRows([unavailable])) expect(r.cells).toEqual([null]);
  });

  it("works on real compareStrategies() output", () => {
    const real = compareStrategies(profile({ previousCrops: ["wheat", "maize"], irrigation: "rainfed", soilType: "loam" }), TEMPERATE);
    for (const r of comparisonRows(real)) for (const c of r.cells) expect(c?.label).toBeTruthy();
  });
});

describe("season helpers", () => {
  it("formats the planting window and the plan year", () => {
    expect(seasonWindow(byId("current").seasons[1])).toEqual({ plant: "Apr", harvest: "Jul", year: 2 });
  });

  it("strips the level from the confidence reason", () => {
    expect(confidenceExplanation({ confidenceReason: "Medium: soil type not given." })).toBe("Soil type not given.");
    expect(confidenceExplanation({ confidenceReason: "Only 4 clear views." })).toBe("Only 4 clear views.");
  });
});

describe("mock rotation strategies (illustrative)", () => {
  it("covers As now, Water-saving and Soil-health with exactly one goal match", () => {
    expect(MOCK_ROTATION_STRATEGIES.map((s) => s.title)).toEqual(["As now", "Water-saving", "Soil-health"]);
    expect(MOCK_ROTATION_STRATEGIES.filter((s) => s.fitsGoal)).toHaveLength(1);
  });

  it("is internally consistent: bare months match the season calendar, every block is filled, sources say sample", () => {
    for (const s of MOCK_ROTATION_STRATEGIES) {
      expect(s.seasons).toHaveLength(3);
      expect(s.seasons.reduce((sum, _, i) => sum + bareMonthsAfter(s.seasons, i), 0)).toBe(s.metrics.bareMonths);
      for (const block of [s.why, s.evidence, s.benefits, s.gaps, s.checkLocally]) expect(block.length).toBeGreaterThan(0);
      for (const e of s.evidence) expect(e.source).toMatch(/\(sample\)$/);
    }
  });

  it("is what the data source returns, flagged as illustrative", () => {
    expect(getStrategyComparison(profile({}), TEMPERATE)).toEqual({ strategies: MOCK_ROTATION_STRATEGIES, illustrative: true });
  });
});
