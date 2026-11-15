import { describe, expect, it } from "vitest";
import { strategyInput } from "../__fixtures__/strategy-input";
import { FAMILY_RANGE, cropFamilyStrategy } from "./crop-family";

const run = (crop: string, history: [string?, string?], pestHistory = false) => cropFamilyStrategy(strategyInput(crop, history, { pestHistory }));

describe("crop family strategy", () => {
  it("rewards three different families in a row (Wheat → Maize → legume)", () => {
    const r = run("soybean", ["maize", "wheat"]);
    // Different family from maize (+2, legacy) and no legume in either previous season (+1).
    expect(r.points).toBe(3);
    expect(r.checks.map((c) => c.rule)).toEqual(["Rotation", "Crop family"]);
    expect(r.checks[1].text).toMatch(/^Recommended to reduce pest and disease risk/);
  });

  it("handles Tomatoes → Wheat → Beans-type and Potatoes → Legumes → Cereals-type sequences", () => {
    expect(run("soybean", ["wheat", "tomato"]).points).toBe(3);
    expect(run("wheat", ["peas", "potato"]).points).toBe(3);
  });

  it("penalises a family returning after only one break season", () => {
    const r = run("potato", ["wheat", "potato"]);
    expect(r.points).toBe(2 - 1); // breaks the cycle vs. wheat, but Solanaceae needs ~3 seasons
    expect(r.checks[1]).toMatchObject({ kind: "note", rule: "Crop family" });
    expect(r.checks[1].text).toMatch(/~3-season break/);
  });

  it("doubles that penalty, as a warning, when pests or disease were reported", () => {
    const r = run("potato", ["wheat", "tomato"], true);
    expect(r.points).toBe(2 - 2);
    expect(r.checks[1].kind).toBe("warn");
  });

  it("does not penalise cereals returning after one season (shorter break is customary)", () => {
    const r = run("wheat", ["soybean", "maize"]);
    expect(r.points).toBe(2);
    expect(r.checks).toHaveLength(1);
  });

  it("adds a third-season-in-a-row penalty on top of the legacy same-crop rules", () => {
    const r = run("potato", ["potato", "tomato"]);
    expect(r.points).toBe(-2 - 1);
    expect(r.checks.at(-1)).toMatchObject({ kind: "warn", rule: "Crop family" });
    expect(run("potato", ["potato", "tomato"], true).points).toBe(-2 - 3 - 1);
  });

  it("keeps legacy texts for same-family-as-last-season", () => {
    const r = run("barley", ["wheat"]);
    expect(r.points).toBe(0);
    expect(r.checks).toEqual([
      { kind: "note", rule: "Rotation", text: "Same family as last season — acceptable without pest history, but a different family breaks pest cycles better." },
    ]);
  });

  it("counts fallow as a known break but mixed vegetables as unknown", () => {
    expect(run("maize", ["soybean", "fallow"]).points).toBe(3);
    expect(run("maize", ["soybean", "vegetables"]).points).toBe(2);
    expect(run("maize", ["fallow"]).points).toBe(0);
  });

  it("is not applicable when last season is unknown", () => {
    expect(run("maize", [])).toMatchObject({ applicable: false, points: 0 });
    expect(run("maize", ["other", "maize"])).toMatchObject({ applicable: false, points: 0 });
  });

  it("stays inside its documented range", () => {
    const crops = ["maize", "wheat", "soybean", "chickpea", "sunflower", "cotton", "potato"];
    const hist = ["maize", "wheat", "soybean", "potato", "tomato", "cotton", "fallow", "other"];
    for (const pests of [false, true]) for (const c of crops) for (const a of hist) for (const b of hist) {
      const p = run(c, [a, b], pests).points;
      expect(p).toBeGreaterThanOrEqual(FAMILY_RANGE.min);
      expect(p).toBeLessThanOrEqual(FAMILY_RANGE.max);
    }
  });
});
