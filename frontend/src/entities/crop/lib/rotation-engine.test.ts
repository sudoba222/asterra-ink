import { describe, expect, it } from "vitest";
import legacyJson from "./__fixtures__/legacy-output.json";
import { LEGACY_SCENARIOS, TEMPERATE, profile } from "./__fixtures__/rotation-scenarios";
import { DRY_SUMMER, WET } from "./__fixtures__/strategy-input";
import { DEFAULT_STRATEGY_WEIGHTS, evaluateRotation, type CandidateResult, type Check } from "./rotation-engine";
import { normalizePoints } from "./strategies";

interface LegacyRun {
  name: string;
  notes: string[];
  missingData: string[];
  candidates: Array<{ id: string; status: CandidateResult["status"]; score: number; seasonLabel: string; checks: Check[] }>;
}
const legacy = legacyJson as LegacyRun[];

const WATER_MISSING = /seasonal water-efficiency check was skipped/;
const key = (c: Check) => `${c.kind}|${c.rule}|${c.text}`;
const byId = (cands: CandidateResult[], id: string) => cands.find((c) => c.crop.id === id)!;

function isSubsequence(small: string[], big: string[]): boolean {
  let i = 0;
  for (const x of big) if (x === small[i]) i++;
  return i === small.length;
}

describe("regression against the pre-strategy engine (legacy-output.json)", () => {
  for (const [i, s] of LEGACY_SCENARIOS.entries()) {
    const before = legacy[i];
    const after = evaluateRotation(s.profile, s.ctx);

    it(`${s.name}: keeps every legacy note, missing-data item and check (in order)`, () => {
      expect(before.name).toBe(s.name);
      expect(after.notes).toEqual(before.notes);
      expect(after.missingData.filter((m) => !WATER_MISSING.test(m))).toEqual(before.missingData);
      for (const old of before.candidates) {
        const now = byId(after.candidates, old.id);
        expect(now.seasonLabel).toBe(old.seasonLabel);
        expect(isSubsequence(old.checks.map(key), now.checks.map(key))).toBe(true);
      }
    });

    it(`${s.name}: identical score and status whenever no new rule fired`, () => {
      for (const old of before.candidates) {
        const now = byId(after.candidates, old.id);
        const legacyKeys = new Set(old.checks.map(key));
        const added = now.checks.filter((c) => !legacyKeys.has(key(c)));
        if (added.length === 0) {
          expect({ id: now.crop.id, score: now.score, status: now.status }).toEqual({ id: old.id, score: old.score, status: old.status });
        } else if (now.status !== old.status) {
          expect(added.some((c) => c.kind === "warn")).toBe(true); // only a new warning may change status
        }
      }
    });
  }

  it("reproduces the legacy ranking exactly when there is no crop history", () => {
    for (const i of [0, 7]) {
      const s = LEGACY_SCENARIOS[i];
      const after = evaluateRotation(s.profile, s.ctx).candidates.map((c) => ({ id: c.crop.id, status: c.status, score: c.score, checks: c.checks }));
      expect(after).toEqual(legacy[i].candidates.map(({ id, status, score, checks }) => ({ id, status, score, checks })));
    }
  });
});

describe("score composition", () => {
  const scenario = { p: profile({ previousCrops: ["soybean", "wheat"], irrigation: "rainfed" }), ctx: DRY_SUMMER };

  it("score is exactly the sum of the weighted components", () => {
    for (const c of evaluateRotation(scenario.p, scenario.ctx).candidates) {
      expect(c.components.map((x) => x.id)).toEqual(["base", "family", "legume", "water"]);
      const sum = Math.round(c.components.reduce((a, x) => a + x.weighted, 0) * 10) / 10;
      expect(c.score).toBe(sum);
      for (const x of c.components) {
        expect(x.normalized).toBeGreaterThanOrEqual(-1);
        expect(x.normalized).toBeLessThanOrEqual(1);
      }
    }
  });

  it("weights scale each strategy independently; 0 switches it off", () => {
    const base = evaluateRotation(scenario.p, scenario.ctx);
    const noFamily = evaluateRotation(scenario.p, scenario.ctx, { weights: { family: 0 } });
    const doubleLegume = evaluateRotation(scenario.p, scenario.ctx, { weights: { legume: 2 } });
    for (const c of base.candidates) {
      const fam = c.components.find((x) => x.id === "family")!;
      const leg = c.components.find((x) => x.id === "legume")!;
      expect(byId(noFamily.candidates, c.crop.id).score).toBeCloseTo(c.score - fam.points, 6);
      expect(byId(doubleLegume.candidates, c.crop.id).score).toBeCloseTo(c.score + leg.points, 6);
    }
    expect(noFamily.weights).toEqual({ ...DEFAULT_STRATEGY_WEIGHTS, family: 0 });
  });

  it("ignores invalid weights", () => {
    const r = evaluateRotation(scenario.p, scenario.ctx, { weights: { legume: -1, water: Number.NaN } });
    expect(r.weights).toEqual(DEFAULT_STRATEGY_WEIGHTS);
  });

  it("normalises by the documented range of each sign", () => {
    expect(normalizePoints(3, { min: -6, max: 3 })).toBe(1);
    expect(normalizePoints(-3, { min: -6, max: 3 })).toBe(-0.5);
    expect(normalizePoints(0, { min: -6, max: 3 })).toBe(0);
    expect(normalizePoints(9, { min: -1, max: 2 })).toBe(1); // clamped
  });

  it("is deterministic", () => {
    expect(evaluateRotation(scenario.p, scenario.ctx)).toEqual(evaluateRotation(scenario.p, scenario.ctx));
  });
});

describe("strategies inside the full engine", () => {
  it("a nitrogen-demanding crop after a legume outranks the same crop after a cereal", () => {
    const afterLegume = byId(evaluateRotation(profile({ previousCrops: ["soybean", ""] }), TEMPERATE).candidates, "maize");
    const afterCereal = byId(evaluateRotation(profile({ previousCrops: ["sorghum", ""] }), TEMPERATE).candidates, "maize");
    expect(afterLegume.score).toBeGreaterThan(afterCereal.score);
    expect(afterLegume.checks.some((c) => /can improve soil nitrogen availability/.test(c.text))).toBe(true);
  });

  it("a second legume ranks below a nitrogen-demanding cereal after a legume", () => {
    const r = evaluateRotation(profile({ previousCrops: ["soybean", "maize"], irrigation: "irrigated" }), TEMPERATE).candidates;
    expect(byId(r, "wheat").score).toBeGreaterThan(byId(r, "chickpea").score);
  });

  it("drought-tolerant crops rise to the top under scarce rainfed water, but not when water is plentiful", () => {
    const p = profile({ previousCrops: ["wheat", "soybean"], irrigation: "rainfed", plantingMonth: 6 });
    const dry = evaluateRotation(p, DRY_SUMMER).candidates;
    const wet = evaluateRotation(p, WET).candidates;
    expect(byId(dry, "sorghum").score - byId(dry, "maize").score).toBeGreaterThan(byId(wet, "sorghum").score - byId(wet, "maize").score);
    expect(byId(wet, "maize").components.find((c) => c.id === "water")!.points).toBe(0);
    expect(byId(dry, "sorghum").checks.some((c) => c.rule === "Water efficiency")).toBe(true);
    expect(byId(wet, "sorghum").checks.some((c) => c.rule === "Water efficiency")).toBe(false);
  });

  it("missing history and missing water data never throw and leave strategies at zero", () => {
    const r = evaluateRotation(profile({ previousCrops: ["", ""], soilType: "unknown" }), { ...TEMPERATE, monthlyRain: Array(12).fill(null), monthlyEt0: Array(12).fill(null) });
    for (const c of r.candidates) {
      for (const s of c.components.filter((x) => x.id !== "base")) expect(s).toMatchObject({ points: 0, applicable: false });
    }
    expect(r.missingData.some((m) => WATER_MISSING.test(m))).toBe(true);
  });

  it("missing climate data entirely still returns every crop", () => {
    const empty = { monthlyTemp: Array(12).fill(null), monthlyTmin: Array(12).fill(null), annualRainfall: null, status: "unavailable" as const };
    const r = evaluateRotation(profile({ previousCrops: ["soybean", "wheat"] }), empty);
    expect(r.candidates).toHaveLength(10);
    expect(byId(r.candidates, "maize").components.find((c) => c.id === "legume")!.points).toBe(1);
  });

  it("irrigated fields do not report missing seasonal water data", () => {
    const r = evaluateRotation(profile({ irrigation: "irrigated" }), TEMPERATE);
    expect(r.missingData.some((m) => WATER_MISSING.test(m))).toBe(false);
  });
});
