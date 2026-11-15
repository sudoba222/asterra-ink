import { describe, expect, it } from "vitest";
import { TEMPERATE, profile } from "./__fixtures__/rotation-scenarios";
import { compareStrategies, type PlannedSeason, type RotationStrategy } from "./compare-strategies";
import { comparisonRows, confidenceExplanation, monthsInGround, seasonWindow } from "./describe-strategy";
import { fieldEvidence } from "./field-calendar";
import { getStrategyComparison } from "./strategy-comparison-source";

const FARMER = profile({ previousCrops: ["wheat", "maize"], irrigation: "rainfed", soilType: "loam" });
const REAL = compareStrategies(FARMER, TEMPERATE);
const byId = (id: RotationStrategy["id"]) => REAL.find((s) => s.id === id)!;

const season = (p: Partial<PlannedSeason>): PlannedSeason => ({
  cropId: "wheat",
  cropName: "Wheat",
  family: "Poaceae",
  plantMonth: 1,
  harvestMonth: 1,
  startOffset: 0,
  status: "suitable",
  ...p,
});

describe("comparisonRows", () => {
  it("has exactly the six agreed criteria, one cell per strategy", () => {
    const rows = comparisonRows(REAL);
    expect(rows.map((r) => r.criterion)).toEqual(["Water", "Nitrogen", "Pest-cycle break", "Climate fit", "Bare months", "Risks"]);
    for (const r of rows) expect(r.cells).toHaveLength(3);
  });

  it("words the metrics for farmers", () => {
    const [water, nitrogen, , climate, bare, risks] = comparisonRows([byId("soil")]);
    const s = byId("soil");
    expect(water.cells[0]?.label).toMatch(/use$|^Unknown$/);
    expect(nitrogen.cells[0]).toMatchObject(s.metrics.legumeSeasons > 0 ? { signal: "good", label: "Adds nitrogen" } : { signal: "watch", label: "No legume" });
    expect(climate.cells[0]?.label).toBe(`${s.metrics.climateFitSeasons} of ${s.seasons.length} seasons`);
    expect(bare.cells[0]?.label).toBe(`${s.metrics.bareMonths} month${s.metrics.bareMonths === 1 ? "" : "s"}`);
    expect(risks.cells[0]?.label).toBe(s.metrics.riskFlags.length ? `${s.metrics.riskFlags.length} risk${s.metrics.riskFlags.length === 1 ? "" : "s"}` : "None flagged");
  });

  it("leaves an unavailable strategy's cells empty", () => {
    const unavailable = compareStrategies(profile({}), TEMPERATE).find((s) => s.id === "current")!;
    expect(unavailable.available).toBe(false);
    for (const r of comparisonRows([unavailable])) expect(r.cells).toEqual([null]);
  });

  it("fills every cell for real compareStrategies() output", () => {
    for (const r of comparisonRows(REAL)) for (const c of r.cells) expect(c?.label).toBeTruthy();
  });
});

describe("season helpers", () => {
  it("formats the planting window and the plan year", () => {
    expect(seasonWindow(season({ plantMonth: 4, harvestMonth: 7, startOffset: 15 }))).toEqual({ plant: "Apr", harvest: "Jul", year: 2 });
  });

  it("lists the months a crop is in the ground, across New Year too", () => {
    expect(monthsInGround({ plantMonth: 4, harvestMonth: 7 })).toEqual([4, 5, 6, 7]);
    expect(monthsInGround({ plantMonth: 11, harvestMonth: 2 })).toEqual([11, 12, 1, 2]);
    expect(monthsInGround({ plantMonth: 6, harvestMonth: 6 })).toEqual([6]);
    expect(monthsInGround({ plantMonth: 3, harvestMonth: 2 })).toHaveLength(12);
  });

  it("strips the level from the confidence reason", () => {
    expect(confidenceExplanation({ confidenceReason: "Medium: soil type not given." })).toBe("Soil type not given.");
    expect(confidenceExplanation({ confidenceReason: "Only 4 clear views." })).toBe("Only 4 clear views.");
  });
});

describe("getStrategyComparison", () => {
  it("returns the real strategies and no calendar without field data", () => {
    expect(getStrategyComparison(FARMER, TEMPERATE)).toEqual({ strategies: REAL, calendar: null });
  });

  it("passes the field calendar through and uses the field evidence", () => {
    const terrain = { source: "NASA NASADEM", elevationM: 800, slopeMeanPct: 9, slopeP90Pct: 15, steepShare: 0.3, erosionRisk: "high" as const, pixels: 40, evidence: [{ text: "Average slope 9 %.", source: "NASA NASADEM" }] };
    const field = fieldEvidence(TEMPERATE, [], [], terrain, null);
    const result = getStrategyComparison(FARMER, TEMPERATE, field);
    expect(result.calendar).toBe(field.calendar);
    expect(result.strategies).toEqual(compareStrategies(FARMER, TEMPERATE, field));
    expect(result.strategies.find((s) => s.id === "soil")!.evidence.map((e) => e.text)).toContain("Average slope 9 %.");
  });
});
