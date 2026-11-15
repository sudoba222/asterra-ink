import { describe, expect, it } from "vitest";
import { HOT, TEMPERATE, profile } from "./__fixtures__/rotation-scenarios";
import { DRY_SUMMER, ET0, WET } from "./__fixtures__/strategy-input";
import { compareStrategies, type RotationStrategy } from "./compare-strategies";
import { fieldEvidence } from "./field-calendar";
import { historyOption } from "../model/catalog";

const byId = (list: RotationStrategy[], id: RotationStrategy["id"]) => list.find((s) => s.id === id)!;
const crops = (s: RotationStrategy) => s.seasons.map((x) => x.cropId);
const wheatAfterMaize = profile({ previousCrops: ["wheat", "maize"], irrigation: "rainfed", soilType: "loam" });

describe("compareStrategies", () => {
  it("returns As now, Water-saving and Soil-health, each with 3 seasons and every block filled", () => {
    const list = compareStrategies(wheatAfterMaize, DRY_SUMMER);
    expect(list.map((s) => s.title)).toEqual(["As now", "Water-saving", "Soil-health"]);
    for (const s of list) {
      expect(s.available).toBe(true);
      expect(s.seasons).toHaveLength(3);
      for (const block of [s.why, s.evidence, s.benefits, s.gaps, s.checkLocally]) expect(block.length).toBeGreaterThan(0);
      for (const e of s.evidence) expect(e.source).toMatch(/NASA|Copernicus/);
    }
  });

  it("continues the farmer's last two crops for As now", () => {
    expect(crops(byId(compareStrategies(wheatAfterMaize, TEMPERATE), "current"))).toEqual(["maize", "wheat", "maize"]);
    expect(crops(byId(compareStrategies(profile({ previousCrops: ["potato", "unknown"] }), TEMPERATE), "current"))).toEqual(["potato", "potato", "potato"]);
  });

  it("asks for the history when the last crops are unknown, and says confidence is low", () => {
    const list = compareStrategies(profile({}), TEMPERATE);
    const current = byId(list, "current");
    expect(current.available).toBe(false);
    expect(current.unavailableReason).toMatch(/last two crops/);
    expect(byId(list, "water").available).toBe(true);
    expect(list.every((s) => s.confidence === "low")).toBe(true);
  });

  it("Water-saving picks no high-water crop on a dry rainfed field", () => {
    const water = byId(compareStrategies(wheatAfterMaize, DRY_SUMMER), "water");
    for (const s of water.seasons) expect(historyOption(s.cropId)?.waterNeed).not.toBe("high");
    expect(water.metrics.water).not.toBe("high");
  });

  it("Soil-health brings in a legume and never repeats a family back to back", () => {
    const soil = byId(compareStrategies(wheatAfterMaize, TEMPERATE), "soil");
    expect(soil.metrics.legumeSeasons).toBeGreaterThan(0);
    expect(soil.metrics.familyRepeats).toBe(0);
  });

  it("no crop family comes back before its rest period in Water-saving or Soil-health", () => {
    for (const ctx of [TEMPERATE, DRY_SUMMER, WET, HOT]) {
      for (const s of compareStrategies(wheatAfterMaize, ctx).filter((x) => x.id !== "current" && x.available)) {
        const fams = s.seasons.map((x) => x.family);
        expect(fams[0]).not.toBe(fams[1]);
        expect(fams[1]).not.toBe(fams[2]);
        if (fams[0] === "Fabaceae") expect(fams[2]).not.toBe("Fabaceae");
      }
    }
  });

  it("does not call a repeated, pest-prone current rotation the best for yield", () => {
    const list = compareStrategies(profile({ previousCrops: ["cotton", "cotton"], issues: ["pests"], soilType: "clay" }), HOT);
    expect(byId(list, "current").fitsGoal).toBe(false);
  });

  it("Soil-health does not start with a legume right after a legume", () => {
    const soil = byId(compareStrategies(profile({ previousCrops: ["soybean", "wheat"], soilType: "loam" }), TEMPERATE), "soil");
    expect(soil.seasons[0].family).not.toBe("Fabaceae");
  });

  it("plans seasons forward in time without overlaps", () => {
    for (const s of compareStrategies(wheatAfterMaize, WET)) {
      for (let i = 1; i < s.seasons.length; i++) expect(s.seasons[i].startOffset).toBeGreaterThan(s.seasons[i - 1].startOffset);
      expect(s.metrics.bareMonths).toBeGreaterThanOrEqual(0);
    }
  });

  it("marks exactly one strategy as fitting the goal", () => {
    for (const goal of ["water", "soil", "risk", "yield", "profit"] as const) {
      const list = compareStrategies({ ...wheatAfterMaize, goal }, DRY_SUMMER);
      expect(list.filter((s) => s.fitsGoal)).toHaveLength(1);
      if (goal === "water") expect(byId(list, "water").fitsGoal).toBe(true);
      if (goal === "soil") expect(byId(list, "soil").fitsGoal).toBe(true);
    }
  });

  it("says no crop fits when every crop fails the climate checks", () => {
    const frozen = { ...TEMPERATE, monthlyTemp: TEMPERATE.monthlyTemp.map(() => -15), monthlyTmin: TEMPERATE.monthlyTmin.map(() => -25) };
    const list = compareStrategies(wheatAfterMaize, frozen);
    expect(byId(list, "water").available).toBe(false);
    expect(byId(list, "soil").unavailableReason).toMatch(/No crop/);
  });

  it("uses field evidence: confidence, cover crop for bare months, heat flags, Sentinel-2 lines", () => {
    const ctx = { ...HOT, monthlyTmax: HOT.monthlyTemp.map((t) => (t ?? 0) + 12), monthlyRain: ET0.map(() => 5), monthlyEt0: ET0 };
    const ndvi = ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"].map((from) => ({ from, ndviMean: 0.12, clearShare: 1 }))
      .concat([{ from: "2026-05-01", ndviMean: 0.45, clearShare: 1 }]);
    const field = fieldEvidence(ctx, ndvi);
    const list = compareStrategies({ ...wheatAfterMaize, irrigation: "rainfed" }, ctx, field);
    expect(list.every((s) => s.confidence === "medium" && /clear satellite views/.test(s.confidenceReason))).toBe(true);
    expect(byId(list, "soil").benefits.join(" ")).toMatch(/cover crop in the bare months \(Nov–Feb\)/);
    expect(list.some((s) => s.metrics.riskFlags.some((f) => /heat/.test(f)))).toBe(true);
    expect(byId(list, "current").evidence.some((e) => e.source === "Copernicus Sentinel-2")).toBe(true);
  });
});
