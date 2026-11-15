import type { PointRange, StrategyId, StrategyWeights } from "../engine-types";
import { FAMILY_RANGE, cropFamilyStrategy } from "./crop-family";
import { LEGUME_RANGE, legumeStrategy } from "./legume";
import { WATER_RANGE, waterEfficiencyStrategy } from "./water-efficiency";

export { cropFamilyStrategy, legumeStrategy, waterEfficiencyStrategy };
export { seasonalWater, WATER_THRESHOLDS, type SeasonalWater, type WaterLevel } from "./water-efficiency";

/** Default multipliers: 1 reproduces the documented points exactly. */
export const DEFAULT_STRATEGY_WEIGHTS: Readonly<StrategyWeights> = Object.freeze({ legume: 1, family: 1, water: 1 });

export const STRATEGY_META: Record<StrategyId, { label: string; range: PointRange }> = {
  family: { label: "Crop family", range: FAMILY_RANGE },
  legume: { label: "Nitrogen", range: LEGUME_RANGE },
  water: { label: "Water efficiency", range: WATER_RANGE },
};

/** Base rules: temperature +2, rainfall +2, one goal bonus +2 (soil or risk); no negative points. */
export const BASE_RANGE: PointRange = { min: 0, max: 6 };

/** Fill gaps with defaults; ignore negative or non-finite values instead of throwing. */
export function resolveWeights(weights?: Partial<StrategyWeights>): StrategyWeights {
  const out = { ...DEFAULT_STRATEGY_WEIGHTS };
  for (const id of Object.keys(out) as StrategyId[]) {
    const w = weights?.[id];
    if (typeof w === "number" && Number.isFinite(w) && w >= 0) out[id] = w;
  }
  return out;
}

/** Scale raw points into [-1, 1]: positive ÷ range.max, negative ÷ |range.min|. */
export function normalizePoints(points: number, range: PointRange): number {
  const n = points >= 0 ? (range.max ? points / range.max : 0) : range.min ? points / -range.min : 0;
  return Math.round(Math.max(-1, Math.min(1, n)) * 1000) / 1000;
}
