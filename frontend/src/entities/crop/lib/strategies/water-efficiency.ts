import { monthName } from "@/shared/lib";
import type { Check, ClimateContext, PointRange, StrategyInput, StrategyOutcome } from "../engine-types";

/**
 * Water-efficient rotation: owns every "prefer thirsty vs. frugal crops" rule, so water
 * efficiency is counted once. (Whether a crop gets *enough* rain at all stays in the base
 * annual-rainfall check; see `rainfallShortageFlagged`.)
 *
 * Seasonal water availability, rainfed fields only (irrigated fields are not scored here):
 *   ratio = season rainfall ÷ season reference ET₀ over the crop's own growing months
 *   scarce < 0.50 ≤ limited < 0.65 ≤ adequate  (UNEP aridity-index class limits)
 *   root-zone wetness < 30 % of saturation tightens the class by one step (never relaxes it).
 *
 *  Low water need, scarce / limited                                  +2 / +1
 *  Medium water need, scarce                                         −1
 *  High water need, scarce / limited                                 −2 / −1   (skipped if the base rainfall check already flagged a shortage)
 *  High-water crop after a high-water crop, water not adequate       −1
 *  Goal "save water": low need +2, high need −1 (legacy) — combined with the scarcity rule by
 *  taking the stronger of the two, not the sum.
 */
export const WATER_RANGE: PointRange = { min: -3, max: 2 };

export const WATER_THRESHOLDS = { scarceBelow: 0.5, limitedBelow: 0.65, drySoilPct: 30 } as const;

export type WaterLevel = "adequate" | "limited" | "scarce";

export interface SeasonalWater {
  rainMm: number;
  et0Mm: number;
  /** rain ÷ ET₀ over the months that had both values. */
  ratio: number;
  /** Mean root-zone wetness over the season, % of saturation; null when unavailable. */
  soilMoisturePct: number | null;
  level: WaterLevel;
  /** True when dry root-zone soil moved the level one step drier. */
  tightenedBySoil: boolean;
  monthsUsed: number;
}

/**
 * Season water balance from NASA POWER monthly series. Returns null when rainfall or ET₀ is
 * missing for more than half of the season — we do not guess the rest.
 */
export function seasonalWater(ctx: ClimateContext, months: number[]): SeasonalWater | null {
  if (!ctx.monthlyRain || !ctx.monthlyEt0 || months.length === 0) return null;
  let rain = 0;
  let et0 = 0;
  let n = 0;
  for (const m of months) {
    const r = ctx.monthlyRain[m];
    const e = ctx.monthlyEt0[m];
    if (r == null || e == null) continue;
    rain += r;
    et0 += e;
    n += 1;
  }
  if (n === 0 || n < Math.ceil(months.length / 2) || et0 <= 0) return null;

  const ratio = rain / et0;
  let level: WaterLevel = ratio < WATER_THRESHOLDS.scarceBelow ? "scarce" : ratio < WATER_THRESHOLDS.limitedBelow ? "limited" : "adequate";

  const soil = (ctx.monthlySoilMoisture ?? []).filter((_, m) => months.includes(m)).filter((v): v is number => v != null);
  const soilMoisturePct = soil.length ? soil.reduce((a, b) => a + b, 0) / soil.length : null;
  let tightenedBySoil = false;
  if (soilMoisturePct !== null && soilMoisturePct < WATER_THRESHOLDS.drySoilPct && level !== "scarce") {
    level = level === "adequate" ? "limited" : "scarce";
    tightenedBySoil = true;
  }
  return { rainMm: rain, et0Mm: et0, ratio, soilMoisturePct, level, tightenedBySoil, monthsUsed: n };
}

function describe(w: SeasonalWater, months: number[]): string {
  const window = `${monthName(months[0])}–${monthName(months[months.length - 1])}`;
  const soil = w.tightenedBySoil && w.soilMoisturePct !== null ? `, and root-zone soil moisture averages only ${Math.round(w.soilMoisturePct)} % of saturation` : "";
  return `season rainfall (${Math.round(w.rainMm)} mm, ${window}) covers ${Math.round(w.ratio * 100)} % of reference evapotranspiration (${Math.round(w.et0Mm)} mm)${soil}`;
}

const SCARCITY_POINTS: Record<WaterLevel, Record<"low" | "medium" | "high", number>> = {
  scarce: { low: 2, medium: -1, high: -2 },
  limited: { low: 1, medium: 0, high: -1 },
  adequate: { low: 0, medium: 0, high: 0 },
};

export function waterEfficiencyStrategy(input: StrategyInput): StrategyOutcome & { water: SeasonalWater | null } {
  const { crop, profile, ctx, months, history, irrigated, rainfallShortageFlagged } = input;
  const checks: Check[] = [];
  const water = irrigated ? null : seasonalWater(ctx, months);

  // Scarcity rule (rainfed / unknown irrigation only).
  let scarcity = 0;
  if (water && water.level !== "adequate") {
    scarcity = SCARCITY_POINTS[water.level][crop.waterNeed];
    if (scarcity < 0 && rainfallShortageFlagged) scarcity = 0; // shortage already counted by the base rainfall check
    if (scarcity > 0) {
      checks.push({ kind: "pass", rule: "Water efficiency", text: `Recommended because of its low water need under current water availability: ${describe(water, months)}.` });
    } else if (scarcity < 0) {
      const need = crop.waterNeed === "high" ? "High" : "Medium";
      checks.push({ kind: "note", rule: "Water efficiency", text: `${need} water need while ${describe(water, months)} — expect irrigation demand or yield risk.` });
    }
  }

  // Farmer goal "save water" (legacy texts and points).
  let goal = 0;
  if (profile.goal === "water") {
    if (crop.waterNeed === "low") {
      goal = 2;
      checks.push({ kind: "pass", rule: "Goal", text: "Low water need — matches the water-saving goal." });
    } else if (crop.waterNeed === "high") {
      goal = -1;
      checks.push({ kind: "warn", rule: "Goal", text: "High water need — conflicts with the water-saving goal." });
    }
  }

  // Sequence rule: two thirsty crops back to back while water is short.
  let sequence = 0;
  if (water && water.level !== "adequate" && crop.waterNeed === "high" && history.last?.waterNeed === "high") {
    sequence = -1;
    checks.push({
      kind: "note",
      rule: "Water efficiency",
      text: `Second high-water crop in a row (${history.last.name.toLowerCase()} last season) under ${water.level} seasonal water — back-to-back thirsty crops draw down soil water with no recovery season.`,
    });
  }

  // Goal and scarcity reward/penalise the same attribute (water need): take the stronger, don't add.
  const preference = Math.abs(goal) >= Math.abs(scarcity) ? goal : scarcity;
  const applicable = water !== null || profile.goal === "water";
  return { id: "water", points: preference + sequence, checks, applicable, water };
}
