import { describe, expect, it } from "vitest";
import { DRY_SUMMER, ET0, SUMMER, WET, strategyInput } from "../__fixtures__/strategy-input";
import { TEMPERATE } from "../__fixtures__/rotation-scenarios";
import { WATER_RANGE, seasonalWater, waterEfficiencyStrategy } from "./water-efficiency";

const run = (crop: string, opts: Parameters<typeof strategyInput>[2] = {}, history: [string?, string?] = []) =>
  waterEfficiencyStrategy(strategyInput(crop, history, { ctx: DRY_SUMMER, ...opts }));

describe("seasonalWater", () => {
  it("uses the crop's own season, not annual rainfall", () => {
    const summer = seasonalWater(DRY_SUMMER, SUMMER)!;
    expect(summer.rainMm).toBe(45);
    expect(summer.et0Mm).toBe(535);
    expect(summer.level).toBe("scarce");
    const winter = seasonalWater(DRY_SUMMER, [10, 11, 0, 1])!;
    expect(winter.level).toBe("adequate");
  });

  it("classifies limited water between the 0.50 and 0.65 ratios", () => {
    const ctx = { ...TEMPERATE, monthlyEt0: ET0, monthlyRain: ET0.map((e) => e * 0.6) };
    expect(seasonalWater(ctx, SUMMER)!.level).toBe("limited");
  });

  it("tightens (never relaxes) the level when root-zone soil is dry", () => {
    const dry = Array(12).fill(20);
    expect(seasonalWater({ ...WET, monthlySoilMoisture: dry }, SUMMER)).toMatchObject({ level: "limited", tightenedBySoil: true, soilMoisturePct: 20 });
    const wet = Array(12).fill(90);
    expect(seasonalWater({ ...DRY_SUMMER, monthlySoilMoisture: wet }, SUMMER)).toMatchObject({ level: "scarce", tightenedBySoil: false });
  });

  it("returns null instead of guessing when data is missing", () => {
    expect(seasonalWater(TEMPERATE, SUMMER)).toBeNull();
    const gappy = { ...DRY_SUMMER, monthlyRain: DRY_SUMMER.monthlyRain!.map((v, m) => (m === 5 || m === 6 || m === 7 ? null : v)) };
    expect(seasonalWater(gappy, SUMMER)).toBeNull();
    const oneGap = { ...DRY_SUMMER, monthlyRain: DRY_SUMMER.monthlyRain!.map((v, m) => (m === 5 ? null : v)) };
    expect(seasonalWater(oneGap, SUMMER)?.monthsUsed).toBe(3);
  });
});

describe("water-efficiency strategy", () => {
  it("prioritises drought-tolerant crops under scarce seasonal water", () => {
    const sorghum = run("sorghum");
    expect(sorghum.points).toBe(2);
    expect(sorghum.checks[0].text).toMatch(/^Recommended because of its low water need under current water availability: season rainfall \(45 mm, Jun–Sep\) covers 8 %/);
    expect(run("wheat").points).toBe(-1);
    expect(run("maize").points).toBe(-2);
  });

  it("does not penalise water-demanding crops when water is sufficient", () => {
    for (const crop of ["maize", "cotton", "alfalfa"]) {
      const r = run(crop, { ctx: WET }, ["maize"]);
      expect(r.points).toBe(0);
      expect(r.checks).toEqual([]);
    }
  });

  it("does not score irrigated fields on rainfall", () => {
    expect(run("maize", { irrigated: true }, ["cotton"])).toMatchObject({ points: 0, checks: [], water: null, applicable: false });
  });

  it("skips the scarcity penalty if the base rainfall check already flagged a shortage", () => {
    expect(run("maize", { rainfallShortageFlagged: true }).points).toBe(0);
    expect(run("sorghum", { rainfallShortageFlagged: true }).points).toBe(2); // rewards are unaffected
  });

  it("penalises consecutive high-water crops when water is constrained", () => {
    const r = run("cotton", {}, ["maize"]);
    expect(r.points).toBe(-2 - 1);
    expect(r.checks.at(-1)!.text).toMatch(/Second high-water crop in a row \(maize \(corn\) last season\) under scarce seasonal water/);
    expect(run("cotton", {}, ["rice"]).points).toBe(-3);
    expect(run("cotton", {}, ["soybean"]).points).toBe(-2);
  });

  it("combines the water-saving goal with scarcity by taking the stronger, not the sum", () => {
    expect(run("barley", { profile: { goal: "water" } }).points).toBe(2);
    expect(run("maize", { profile: { goal: "water" } }).points).toBe(-2);
    expect(run("maize", { profile: { goal: "water" }, ctx: WET }).points).toBe(-1); // legacy goal rule alone
    const checks = run("barley", { profile: { goal: "water" } }).checks.map((c) => c.rule);
    expect(checks).toEqual(["Water efficiency", "Goal"]);
  });

  it("reports itself not applicable when the season water series is missing", () => {
    expect(run("sorghum", { ctx: TEMPERATE })).toMatchObject({ applicable: false, points: 0, checks: [] });
  });

  it("stays inside its documented range", () => {
    for (const crop of ["maize", "wheat", "barley", "sorghum", "soybean", "cotton", "alfalfa"])
      for (const goal of ["yield", "water"] as const)
        for (const last of ["maize", "rice", "barley"]) {
          const p = run(crop, { profile: { goal } }, [last]).points;
          expect(p).toBeGreaterThanOrEqual(WATER_RANGE.min);
          expect(p).toBeLessThanOrEqual(WATER_RANGE.max);
        }
  });
});
