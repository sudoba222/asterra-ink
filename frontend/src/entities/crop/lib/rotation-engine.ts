import { monthName } from "@/shared/lib";
import { CROPS, cropById, historyOption, type Crop } from "../model/catalog";
import type { FarmerProfile } from "../model/farmer-profile";
import type { Check, ClimateContext, ScoreComponent, SeasonHistory, StrategyInput, StrategyOutcome, StrategyWeights } from "./engine-types";
import { BASE_RANGE, STRATEGY_META, cropFamilyStrategy, legumeStrategy, normalizePoints, resolveWeights, waterEfficiencyStrategy } from "./strategies";

export type { Check, CheckKind, ClimateContext, ScoreComponent, StrategyId, StrategyWeights } from "./engine-types";
export { DEFAULT_STRATEGY_WEIGHTS, seasonalWater, type SeasonalWater, type WaterLevel } from "./strategies";

/**
 * Transparent rule engine. Rules + weights are documented in RULES / WEIGHTS and
 * shown in the UI. It filters and orders candidates; it never estimates profit.
 *
 * score = base points (climate, rainfall, soil/risk goal)
 *       + Σ strategy weight × strategy points (crop family, nitrogen/legumes, water efficiency)
 * Each agronomic factor is owned by exactly one component, so nothing is counted twice.
 */

export interface CandidateResult {
  crop: Crop;
  status: "suitable" | "caution" | "excluded";
  score: number;
  seasonLabel: string;
  checks: Check[];
  /** Breakdown of `score` (additive field; older consumers can ignore it). */
  components: ScoreComponent[];
}

export interface RotationResult {
  candidates: CandidateResult[];
  missingData: string[];
  notes: string[];
  /** Strategy multipliers used for this run. */
  weights: StrategyWeights;
}

export interface EvaluateOptions {
  /** Per-strategy multipliers; missing / invalid entries fall back to 1. */
  weights?: Partial<StrategyWeights>;
}

export const WEIGHTS = [
  { rule: "Season temperature in optimal range", points: "+2" },
  { rule: "Rainfall in optimal range, or field irrigated", points: "+2" },
  { rule: "Different family from last season", points: "+2" },
  { rule: "Legume after a cereal (nitrogen benefit)", points: "+1" },
  { rule: "Matches goal (soil → legumes, water → low water need, risk → robust fit)", points: "+2" },
  { rule: "Same crop as last season", points: "−2" },
  { rule: "Same family after reported pests/disease", points: "−3" },
  { rule: "High water need when goal is saving water", points: "−1" },
  { rule: "Crop family not grown in either of the last two seasons", points: "+1" },
  { rule: "Family returns after one break season (needs a longer break)", points: "−1 / −2 with pests" },
  { rule: "Third season in a row of the same family", points: "−1" },
  { rule: "Legume after another nitrogen-demanding crop", points: "+1" },
  { rule: "Legume after two nitrogen-demanding seasons", points: "+1" },
  { rule: "Nitrogen-demanding crop after a legume", points: "+1" },
  { rule: "Legume after a legume", points: "−1" },
  { rule: "Rainfed, scarce / limited season water: low water need", points: "+2 / +1" },
  { rule: "Rainfed, scarce season water: medium / high water need", points: "−1 / −2" },
  { rule: "Rainfed, limited season water: high water need", points: "−1" },
  { rule: "Second high-water crop in a row while water is short", points: "−1" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

function resolveHistory(profile: FarmerProfile): SeasonHistory {
  const pick = (id: string | undefined) => (id && id !== "unknown" ? historyOption(id) : null);
  return { last: pick(profile.previousCrops[0]), before: pick(profile.previousCrops[1]) };
}

export function seasonMonths(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => (start + i) % 12);
}

function seasonMean(values: Array<number | null>, months: number[]): number | null {
  const v = months.map((m) => values[m]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function bestStart(crop: Crop, ctx: ClimateContext): number {
  const mid = (crop.temperature.optMin + crop.temperature.optMax) / 2;
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < 12; s++) {
    const t = seasonMean(ctx.monthlyTemp, seasonMonths(s, crop.seasonMonths));
    if (t === null) continue;
    const d = Math.abs(t - mid);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function evaluateRotation(profile: FarmerProfile, ctx: ClimateContext, options: EvaluateOptions = {}): RotationResult {
  const missingData: string[] = [];
  const notes: string[] = [];
  const weights = resolveWeights(options.weights);
  const history = resolveHistory(profile);
  const last = profile.previousCrops[0];
  const before = profile.previousCrops[1];
  const lastFamily = history.last?.family ?? null;
  const pestHistory = profile.issues.includes("pests") || profile.issues.includes("disease");
  const irrigated = profile.irrigation === "irrigated" || profile.irrigation === "both";

  if (!last || last === "unknown") missingData.push("Last season's crop — rotation rules can't be applied without it.");
  if (profile.plantingMonth === null) notes.push("Planting month unknown — each crop is evaluated in its best-matching season window.");
  if (profile.soilType === "unknown") missingData.push("Soil type / texture (e.g. from a soil test or SoilGrids) — drainage and water-holding checks are skipped.");
  if (profile.irrigation === "unknown") missingData.push("Irrigation — water checks assume rainfed conditions.");
  if (pestHistory && !profile.issueDetail.trim()) missingData.push("Which pest or disease — host ranges differ, so family-level rules are only a first filter.");
  missingData.push("Local selling prices and production costs — required before any profit comparison.");
  if (profile.goal === "profit") notes.push("Profit goal selected, but no price or cost data is available, so candidates are NOT ranked by profit.");
  if (ctx.status === "sample") notes.push("Climate inputs are SAMPLE data (NASA POWER unavailable) — results are for interface testing only.");
  if (last && before && last === before && last !== "unknown" && lastFamily) {
    notes.push(`${cropById(last)?.name ?? "The same crop"} was grown two seasons in a row — breaking the sequence lowers pest and disease carry-over.`);
  }

  let waterDataMissing = false;
  const candidates = CROPS.map((crop): CandidateResult => {
    const checks: Check[] = [];
    let score = 0;
    const start = profile.plantingMonth !== null ? profile.plantingMonth - 1 : bestStart(crop, ctx);
    const months = seasonMonths(start, crop.seasonMonths);
    const seasonLabel = `${monthName(months[0])} – ${monthName(months[months.length - 1])}`;

    // Climate: season temperature
    const t = seasonMean(ctx.monthlyTemp, months);
    if (t === null) {
      checks.push({ kind: "note", rule: "Temperature", text: "No temperature data for this season." });
    } else if (t < crop.temperature.absMin || t > crop.temperature.absMax) {
      checks.push({ kind: "fail", rule: "Temperature", text: `Season mean ${t.toFixed(1)} °C is outside the crop's tolerated range (${crop.temperature.absMin}–${crop.temperature.absMax} °C).` });
    } else if (t < crop.temperature.optMin || t > crop.temperature.optMax) {
      checks.push({ kind: "warn", rule: "Temperature", text: `Season mean ${t.toFixed(1)} °C is tolerated but outside the optimal ${crop.temperature.optMin}–${crop.temperature.optMax} °C.` });
    } else {
      score += 2;
      checks.push({ kind: "pass", rule: "Temperature", text: `Season mean ${t.toFixed(1)} °C is within the optimal ${crop.temperature.optMin}–${crop.temperature.optMax} °C.` });
    }

    // Frost
    if (!crop.frostTolerant) {
      const frostMonths = months.filter((m) => (ctx.monthlyTmin[m] ?? 99) <= 0);
      if (frostMonths.length) {
        checks.push({ kind: "warn", rule: "Frost", text: `Frost recorded (minimum ≤ 0 °C) in ${frostMonths.map(monthName).join(", ")} — this crop is frost-sensitive.` });
      }
    }

    // Water
    const rain = ctx.annualRainfall;
    if (rain === null) {
      checks.push({ kind: "note", rule: "Water", text: "No rainfall data." });
    } else if (irrigated) {
      score += 2;
      checks.push({ kind: "pass", rule: "Water", text: `Irrigated field — rainfall (${Math.round(rain)} mm/yr) is not limiting${crop.waterNeed === "high" ? ", but this crop uses a lot of water" : ""}.` });
    } else if (rain < crop.rainfall.absMin) {
      checks.push({ kind: "fail", rule: "Water", text: `Annual rainfall ${Math.round(rain)} mm is below the ~${crop.rainfall.absMin} mm this crop needs without irrigation.` });
    } else if (rain < crop.rainfall.optMin) {
      checks.push({ kind: "warn", rule: "Water", text: `Annual rainfall ${Math.round(rain)} mm is below the optimal ${crop.rainfall.optMin}–${crop.rainfall.optMax} mm — supplemental irrigation may be needed.` });
    } else if (rain > crop.rainfall.absMax) {
      checks.push({ kind: "warn", rule: "Water", text: `Annual rainfall ${Math.round(rain)} mm exceeds the usual range — disease and waterlogging risk.` });
    } else {
      score += 2;
      checks.push({ kind: "pass", rule: "Water", text: `Annual rainfall ${Math.round(rain)} mm suits this crop.` });
    }

    // Rotation strategies: crop family, then nitrogen (legumes). They own all rotation points.
    const input: StrategyInput = {
      crop,
      profile,
      ctx,
      months,
      history,
      pestHistory,
      irrigated,
      rainfallShortageFlagged: !irrigated && rain !== null && rain < crop.rainfall.optMin,
    };
    const outcomes: StrategyOutcome[] = [cropFamilyStrategy(input), legumeStrategy(input)];
    for (const o of outcomes) checks.push(...o.checks);

    // Soil & field issues
    if (crop.drainageSensitive && (profile.soilType === "clay" || profile.issues.includes("waterlogging"))) {
      checks.push({ kind: "warn", rule: "Drainage", text: "Sensitive to waterlogging — risky on heavy clay or poorly drained fields." });
    }
    if (profile.soilType === "sandy" && crop.waterNeed === "high" && !irrigated) {
      checks.push({ kind: "warn", rule: "Soil", text: "High water need on sandy soil without irrigation — low water-holding capacity." });
    }
    if (profile.issues.includes("salinity")) {
      if (crop.salinity === "sensitive") checks.push({ kind: "warn", rule: "Salinity", text: "Salt-sensitive crop — reported salinity may reduce yield." });
      if (crop.salinity === "tolerant") checks.push({ kind: "pass", rule: "Salinity", text: "Relatively salt-tolerant." });
    }

    // Goal
    if (profile.goal === "soil" && crop.nitrogen === "fixes") {
      score += 2;
      checks.push({ kind: "pass", rule: "Goal", text: "Supports soil health: legume that adds nitrogen." });
    }
    // Water-efficiency strategy (owns the water-saving goal rule as well as seasonal scarcity).
    const water = waterEfficiencyStrategy(input);
    if (!irrigated && !water.water) waterDataMissing = true;
    checks.push(...water.checks);
    outcomes.push(water);

    if (profile.goal === "risk" && crop.waterNeed !== "high" && checks.every((c) => c.kind !== "warn" && c.kind !== "fail")) {
      score += 2;
      checks.push({ kind: "pass", rule: "Goal", text: "No warnings — a lower-risk option under current conditions." });
    }

    const components: ScoreComponent[] = [
      { id: "base", label: "Climate, rainfall & goal", points: score, weight: 1, weighted: score, normalized: normalizePoints(score, BASE_RANGE), applicable: true },
      ...outcomes.map((o) => ({
        id: o.id,
        label: STRATEGY_META[o.id].label,
        points: o.points,
        weight: weights[o.id],
        weighted: round1(o.points * weights[o.id]),
        normalized: normalizePoints(o.points, STRATEGY_META[o.id].range),
        applicable: o.applicable,
      })),
    ];
    const total = round1(components.reduce((sum, c) => sum + c.weighted, 0));

    const status = checks.some((c) => c.kind === "fail") ? "excluded" : checks.some((c) => c.kind === "warn") ? "caution" : "suitable";
    return { crop, status, score: total, seasonLabel, checks, components };
  });

  if (waterDataMissing) {
    missingData.push("Monthly rainfall and evapotranspiration for the growing season — the seasonal water-efficiency check was skipped for some or all crops.");
  }

  const order = { suitable: 0, caution: 1, excluded: 2 };
  candidates.sort((a, b) => order[a.status] - order[b.status] || b.score - a.score || a.crop.name.localeCompare(b.crop.name));
  return { candidates, missingData, notes, weights };
}
