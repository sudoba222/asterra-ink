import { monthName } from "@/shared/lib";
import { FAMILY_ROTATION, cropById, historyOption, type Crop, type CropFamily } from "../model/catalog";
import type { FarmerProfile } from "../model/farmer-profile";
import type { ClimateContext } from "./engine-types";
import { monthRanges, type EvidenceLine, type FieldEvidence } from "./field-calendar";
import { bestStart, evaluateRotation, type CandidateResult } from "./rotation-engine";
import { seasonalWater } from "./strategies";

/**
 * Compares three crop-rotation strategies over the next three seasons (the challenge asks for
 * "at least three rotation strategies, including the existing rotation").
 *
 *   current: the farmer's last two crops, continued (the baseline)
 *   water:   low-water crops that still pass the climate checks
 *   soil:    a legume early, no crop family back before its rest period, more roots and residue
 *
 * Every season is scored by the existing rule engine (`evaluateRotation`) with that season's
 * history, so the strategies use exactly the same documented rules as the crop ranking.
 * No AI and no network: a pure function, unit-tested.
 */

export type RotationStrategyId = "current" | "water" | "soil";

export interface PlannedSeason {
  cropId: string;
  cropName: string;
  family: CropFamily | null;
  /** 1–12. */
  plantMonth: number;
  /** 1–12. */
  harvestMonth: number;
  /** Months since the start of the plan when this crop is planted (0 = first month). */
  startOffset: number;
  /** From the rule engine; "unknown" for crops outside the catalog (no climate ranges). */
  status: CandidateResult["status"] | "unknown";
}

export interface StrategyMetrics {
  water: "low" | "medium" | "high" | "unknown";
  legumeSeasons: number;
  /** Seasons where the crop family is the same as the season before (0 is best). */
  familyRepeats: number;
  /** Seasons whose temperature is in the crop's optimal range and that pass every climate check. */
  climateFitSeasons: number;
  /** Months between harvest and the next planting inside the plan. */
  bareMonths: number;
  riskFlags: string[];
}

export interface RotationStrategy {
  id: RotationStrategyId;
  title: string;
  /** False when the strategy can't be built (e.g. last crops unknown); `unavailableReason` says why. */
  available: boolean;
  unavailableReason?: string;
  seasons: PlannedSeason[];
  fitsGoal: boolean;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  why: string[];
  evidence: EvidenceLine[];
  benefits: string[];
  gaps: string[];
  checkLocally: string[];
  metrics: StrategyMetrics;
}

const TITLES: Record<RotationStrategyId, string> = { current: "As now", water: "Water-saving", soil: "Soil-health" };
const SEASONS = 3;
const WATER_RANK = { low: 1, medium: 2, high: 3 } as const;
const RISK_RULES = new Set(["Frost", "Temperature", "Water", "Drainage", "Salinity", "Soil"]);

const known = (id: string | undefined) => !!id && id !== "unknown";

/** First month index ≥ `after` whose calendar month is `month0` (0–11). */
function nextStart(after: number, month0: number): number {
  return after + ((((month0 - after) % 12) + 12) % 12);
}

interface SeasonPick {
  id: string;
  candidate: CandidateResult | null;
}

/** Runs the rule engine for one season, as if `prev` and `prevPrev` were the last two crops. */
function evaluateSeason(profile: FarmerProfile, ctx: ClimateContext, prev: string, prevPrev: string, first: boolean) {
  return evaluateRotation({ ...profile, previousCrops: [prev, prevPrev], plantingMonth: first ? profile.plantingMonth : null }, ctx).candidates;
}

function familyOf(id: string): CropFamily | null {
  return historyOption(id)?.family ?? null;
}

/** True when `family` is still in its rest period, looking back over `recent` (newest first). */
function familyResting(family: CropFamily, recent: Array<CropFamily | null>): boolean {
  return recent.slice(0, FAMILY_ROTATION[family].minBreakSeasons).includes(family);
}

function chooseWater(cands: CandidateResult[], recent: Array<CropFamily | null>, irrigated: boolean): CandidateResult | null {
  const ok = cands.filter((c) => c.status !== "excluded");
  const allowed = (c: CandidateResult) => c.crop.waterNeed === "low" || (irrigated && c.crop.waterNeed === "medium");
  const rested = (c: CandidateResult) => !familyResting(c.crop.family, recent);
  const notAgain = (c: CandidateResult) => c.crop.family !== recent[0];
  return (
    ok.find((c) => allowed(c) && rested(c)) ??
    ok.find((c) => allowed(c) && notAgain(c)) ??
    ok.find((c) => c.crop.waterNeed !== "high" && notAgain(c)) ??
    ok.find(notAgain) ??
    ok[0] ??
    null
  );
}

/** Soil-building value: legume +1, deep roots +1, high residue +1 (medium +0.5). Counted twice in the ranking. */
export function soilValue(c: Crop): number {
  return (c.nitrogen === "fixes" ? 1 : 0) + (c.rootDepth === "deep" ? 1 : 0) + (c.residue === "high" ? 1 : c.residue === "medium" ? 0.5 : 0);
}

function chooseSoil(cands: CandidateResult[], recent: Array<CropFamily | null>, needLegume: boolean): CandidateResult | null {
  const ok = cands.filter((c) => c.status !== "excluded");
  const resting = ok.filter((c) => !familyResting(c.crop.family, recent));
  const pool = resting.length ? resting : ok.filter((c) => c.crop.family !== recent[0]);
  const ranked = [...(pool.length ? pool : ok)].sort(
    (a, b) => (a.status === b.status ? 0 : a.status === "suitable" ? -1 : 1) || b.score + 2 * soilValue(b.crop) - (a.score + 2 * soilValue(a.crop)),
  );
  return (needLegume ? ranked.find((c) => c.crop.nitrogen === "fixes") : null) ?? ranked[0] ?? null;
}

/** The farmer's last two crops continued: last = A, before = B → B, A, B. */
function currentSequence(profile: FarmerProfile): string[] | null {
  const [last, before] = profile.previousCrops;
  if (!known(last) || last === "fallow") return null;
  if (!known(before) || before === last || before === "fallow") return [last, last, last];
  return [before, last, before];
}

function buildPicks(id: RotationStrategyId, profile: FarmerProfile, ctx: ClimateContext): SeasonPick[] | null {
  const irrigated = profile.irrigation === "irrigated" || profile.irrigation === "both";
  let prev = known(profile.previousCrops[0]) ? profile.previousCrops[0] : "";
  let prevPrev = known(profile.previousCrops[1]) ? profile.previousCrops[1] : "";
  const recent: Array<CropFamily | null> = [familyOf(prev), familyOf(prevPrev)];
  const sequence = id === "current" ? currentSequence(profile) : null;
  if (id === "current" && !sequence) return null;

  const picks: SeasonPick[] = [];
  let legumes = 0;
  for (let i = 0; i < SEASONS; i++) {
    const cands = evaluateSeason(profile, ctx, prev, prevPrev, i === 0);
    let pick: SeasonPick;
    if (sequence) {
      pick = { id: sequence[i], candidate: cands.find((c) => c.crop.id === sequence[i]) ?? null };
    } else {
      const needLegume = legumes === 0 && (i === 0 ? historyOption(prev)?.nitrogen !== "fixes" : i === SEASONS - 1);
      const c = id === "water" ? chooseWater(cands, recent, irrigated) : chooseSoil(cands, recent, needLegume);
      if (!c) return picks.length ? picks : [];
      pick = { id: c.crop.id, candidate: c };
    }
    picks.push(pick);
    if (pick.candidate?.crop.nitrogen === "fixes" || historyOption(pick.id)?.nitrogen === "fixes") legumes++;
    recent.unshift(familyOf(pick.id));
    prevPrev = prev;
    prev = pick.id;
  }
  return picks;
}

function schedule(picks: SeasonPick[], profile: FarmerProfile, ctx: ClimateContext): PlannedSeason[] {
  const seasons: PlannedSeason[] = [];
  let free = 0; // first month the field is free
  for (const [i, p] of picks.entries()) {
    const crop = cropById(p.id);
    const length = crop?.seasonMonths ?? 4;
    const start0 = i === 0 && profile.plantingMonth !== null ? profile.plantingMonth - 1 : crop ? bestStart(crop, ctx) : free % 12;
    const startOffset = i === 0 ? start0 : nextStart(free, start0);
    const harvestOffset = startOffset + length - 1;
    seasons.push({
      cropId: p.id,
      cropName: crop?.name ?? historyOption(p.id)?.name ?? p.id,
      family: familyOf(p.id),
      plantMonth: (startOffset % 12) + 1,
      harvestMonth: (harvestOffset % 12) + 1,
      startOffset,
      status: p.candidate?.status ?? "unknown",
    });
    free = harvestOffset + 1;
  }
  return seasons;
}

function seasonMonthsOf(s: PlannedSeason): number[] {
  const len = ((s.harvestMonth - s.plantMonth + 12) % 12) + 1;
  return Array.from({ length: len }, (_, k) => (s.plantMonth - 1 + k) % 12);
}

function metricsFor(picks: SeasonPick[], seasons: PlannedSeason[], profile: FarmerProfile, field?: FieldEvidence): StrategyMetrics {
  const needs = picks.map((p) => cropById(p.id)?.waterNeed ?? historyOption(p.id)?.waterNeed ?? null);
  const knownNeeds = needs.filter((n): n is "low" | "medium" | "high" => n !== null);
  const avg = knownNeeds.length ? knownNeeds.reduce((a, n) => a + WATER_RANK[n], 0) / knownNeeds.length : null;
  let familyRepeats = 0;
  let prevFamily = familyOf(profile.previousCrops[0]);
  for (const s of seasons) {
    if (s.family && s.family === prevFamily) familyRepeats++;
    prevFamily = s.family;
  }
  const bareMonths = seasons.slice(1).reduce((sum, s, i) => sum + (s.startOffset - (seasons[i].startOffset + seasonMonthsOf(seasons[i]).length)), 0);

  const riskFlags: string[] = [];
  for (const [i, p] of picks.entries()) {
    const name = seasons[i].cropName;
    for (const c of p.candidate?.checks ?? []) {
      if ((c.kind === "warn" || c.kind === "fail") && RISK_RULES.has(c.rule)) riskFlags.push(`${name}: ${c.rule.toLowerCase()}`);
    }
    const cal = field?.calendar;
    if (cal) {
      const months = seasonMonthsOf(seasons[i]).map((m) => m + 1);
      if (months.some((m) => cal.heatMonths.includes(m))) riskFlags.push(`${name}: heat`);
      if (months.some((m) => cal.dryMonths.includes(m)) && profile.irrigation !== "irrigated" && profile.irrigation !== "both") riskFlags.push(`${name}: dry months`);
    }
  }
  return {
    water: avg === null ? "unknown" : avg <= 1.5 ? "low" : avg <= 2.3 ? "medium" : "high",
    legumeSeasons: picks.filter((p) => historyOption(p.id)?.nitrogen === "fixes").length,
    familyRepeats,
    climateFitSeasons: picks.filter((p) => p.candidate && p.candidate.status !== "excluded" && p.candidate.checks.some((c) => c.rule === "Temperature" && c.kind === "pass") && !p.candidate.checks.some((c) => c.kind === "fail")).length,
    bareMonths: Math.max(0, bareMonths),
    riskFlags: [...new Set(riskFlags)],
  };
}

function evidenceFor(picks: SeasonPick[], seasons: PlannedSeason[], profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): EvidenceLine[] {
  const out: EvidenceLine[] = [];
  const irrigated = profile.irrigation === "irrigated" || profile.irrigation === "both";
  for (const [i, p] of picks.entries()) {
    const temp = p.candidate?.checks.find((c) => c.rule === "Temperature");
    if (temp) out.push({ text: `${seasons[i].cropName}: ${temp.text}`, source: "NASA POWER" });
    if (!irrigated && cropById(p.id)) {
      const w = seasonalWater(ctx, seasonMonthsOf(seasons[i]));
      if (w) out.push({ text: `${seasons[i].cropName} (${monthName(seasons[i].plantMonth - 1)}–${monthName(seasons[i].harvestMonth - 1)}): rain covers ${Math.round(w.ratio * 100)} % of the water plants lose to evaporation (${Math.round(w.rainMm)} of ${Math.round(w.et0Mm)} mm).`, source: "NASA POWER" });
    }
  }
  if (ctx.annualRainfall !== null) out.push({ text: `Annual rainfall about ${Math.round(ctx.annualRainfall)} mm.`, source: "NASA POWER" });
  const all = [...out, ...(field?.evidence ?? [])];
  return all.filter((e, i) => all.findIndex((x) => x.text === e.text) === i);
}

function confidenceFor(profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): Pick<RotationStrategy, "confidence" | "confidenceReason"> {
  if (!known(profile.previousCrops[0])) return { confidence: "low", confidenceReason: "Low: your last crops are not given." };
  if (ctx.status !== "live") return { confidence: "low", confidenceReason: "Low: live NASA climate data is not available." };
  if (profile.soilType === "unknown") return { confidence: "medium", confidenceReason: "Medium: soil type not given." };
  if (field?.clearNdviViews !== undefined && field.clearNdviViews < 10) return { confidence: "medium", confidenceReason: `Medium: only ${field.clearNdviViews} clear satellite views of the field in 12 months.` };
  return { confidence: "high", confidenceReason: "High: crop history, soil type and live NASA data are all available." };
}

function textsFor(id: RotationStrategyId, picks: SeasonPick[], seasons: PlannedSeason[], m: StrategyMetrics, profile: FarmerProfile, field?: FieldEvidence) {
  const crops = picks.map((p) => cropById(p.id)).filter((c): c is Crop => !!c);
  const names = (f: (c: Crop) => boolean) => [...new Set(crops.filter(f).map((c) => c.name))];
  const families = new Set(seasons.map((s) => s.family).filter(Boolean));
  const irrigated = profile.irrigation === "irrigated" || profile.irrigation === "both";
  const why: string[] = [];
  const benefits: string[] = [];
  const checkLocally: string[] = [];
  const gaps: string[] = ["Local prices and buyers: we have no market data, so no strategy is ranked by profit."];

  if (id === "current") {
    why.push("This is what you grew in the last two seasons, continued. It is the baseline to compare the other two with.");
    benefits.push("No new seeds, equipment or buyers needed: you already know these crops.");
  } else if (id === "water") {
    why.push(`Chooses crops with ${irrigated ? "low or medium" : "low"} water need that still pass the climate checks for your field.`);
    why.push("Changes crop family every season so pests of one crop don't build up.");
  } else {
    why.push("Brings in a legume to add nitrogen, and keeps each crop family away until its rest period is over.");
    why.push("Prefers crops with deep roots and a lot of residue, which build soil structure and organic matter.");
    if (field?.peakNdvi && field.peakNdvi.value < 0.5 && (field.greenSeasons ?? 0) > 0)
      why.push(`Your field's greenest point in the last 12 months was only NDVI ${field.peakNdvi.value.toFixed(2)}. Weak growth can mean tired soil.`);
  }

  if (m.legumeSeasons > 0) benefits.push(`Adds nitrogen in ${m.legumeSeasons} season${m.legumeSeasons > 1 ? "s" : ""} (${names((c) => c.nitrogen === "fixes").join(", ")}), so the next crop needs less fertiliser.`);
  if (families.size >= 3) benefits.push(`${families.size} different crop families in 3 seasons break pest and disease cycles.`);
  const lowWater = names((c) => c.waterNeed === "low");
  if (lowWater.length && id !== "current") benefits.push(`Uses less water: ${lowWater.join(", ")} ${lowWater.length > 1 ? "need" : "needs"} little water.`);
  const deep = names((c) => c.rootDepth === "deep");
  if (deep.length) benefits.push(`Deep roots (${deep.join(", ")}) loosen compacted soil and help water soak in.`);
  const residue = names((c) => c.residue === "high");
  if (residue.length) benefits.push(`${residue.join(", ")} ${residue.length > 1 ? "leave" : "leaves"} a lot of residue: more organic matter and less erosion.`);
  const forage = names((c) => c.forage);
  if (forage.length) benefits.push(`${forage.join(", ")} can also be used or sold as animal feed.`);
  const bare = field?.calendar?.bareMonths ?? [];
  if (id === "soil" && bare.length >= 2) benefits.push(`Sow a cover crop in the bare months (${monthRanges(bare)}) to keep the soil covered.`);

  if (m.familyRepeats > 0 && id === "current") checkLocally.push(`The same crop family follows itself ${m.familyRepeats} time${m.familyRepeats > 1 ? "s" : ""}: watch for build-up of pests and soil diseases.`);
  for (const p of picks) {
    for (const c of p.candidate?.checks ?? []) if ((c.kind === "warn" || c.kind === "fail") && RISK_RULES.has(c.rule)) checkLocally.push(`${p.candidate!.crop.name}: ${c.text}`);
  }
  if (id !== "current") {
    const fresh = seasons.filter((s) => s.cropId !== profile.previousCrops[0] && s.cropId !== profile.previousCrops[1]).map((s) => s.cropName);
    if (fresh.length) checkLocally.push(`Check that seed, equipment and buyers for ${[...new Set(fresh)].join(", ")} are available near you.`);
  }
  if (profile.issues.includes("erosion")) checkLocally.push("You reported erosion: on slopes, plant across the slope and keep residue on the field.");
  checkLocally.push("Crop ranges are indicative (FAO ECOCROP), not checked for your district. Ask a local agronomist.");

  if (profile.soilType === "unknown") gaps.push("Soil test (texture, nutrients, salinity): soil checks were skipped.");
  if (profile.irrigation === "unknown") gaps.push("Irrigation: water checks assume a rainfed field.");
  for (const s of seasons) if (s.status === "unknown") gaps.push(`${s.cropName}: not in our crop catalog, so its climate fit can't be checked.`);
  if (!field?.clearNdviViews) gaps.push("No satellite history of this field was used (Sentinel-2 NDVI).");

  return { why, benefits, checkLocally: [...new Set(checkLocally)], gaps: [...new Set(gaps)] };
}

const EMPTY_METRICS: StrategyMetrics = { water: "unknown", legumeSeasons: 0, familyRepeats: 0, climateFitSeasons: 0, bareMonths: 0, riskFlags: [] };

function goalWinner(strategies: RotationStrategy[], goal: FarmerProfile["goal"]): RotationStrategyId | null {
  const ok = strategies.filter((s) => s.available);
  if (!ok.length) return null;
  if (goal === "water") return ok.find((s) => s.id === "water")?.id ?? null;
  if (goal === "soil") return ok.find((s) => s.id === "soil")?.id ?? null;
  if (goal === "risk") return [...ok].sort((a, b) => a.metrics.riskFlags.length - b.metrics.riskFlags.length)[0].id;
  // yield, profit: most seasons in the optimal climate range; ties → fewer risks, then fewer family repeats.
  return [...ok].sort(
    (a, b) =>
      b.metrics.climateFitSeasons - a.metrics.climateFitSeasons ||
      a.metrics.riskFlags.length - b.metrics.riskFlags.length ||
      a.metrics.familyRepeats - b.metrics.familyRepeats,
  )[0].id;
}

export function compareStrategies(profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): RotationStrategy[] {
  const strategies = (["current", "water", "soil"] as const).map((id): RotationStrategy => {
    const picks = buildPicks(id, profile, ctx);
    const conf = confidenceFor(profile, ctx, field);
    if (!picks || picks.length === 0) {
      return {
        id,
        title: TITLES[id],
        available: false,
        unavailableReason: id === "current" ? "Tell us your last two crops to see your current rotation." : "No crop in our catalog passes the climate checks for this field.",
        seasons: [],
        fitsGoal: false,
        ...conf,
        why: [],
        evidence: [],
        benefits: [],
        gaps: [],
        checkLocally: [],
        metrics: EMPTY_METRICS,
      };
    }
    const seasons = schedule(picks, profile, ctx);
    const metrics = metricsFor(picks, seasons, profile, field);
    return {
      id,
      title: TITLES[id],
      available: true,
      seasons,
      fitsGoal: false,
      ...conf,
      evidence: evidenceFor(picks, seasons, profile, ctx, field),
      metrics,
      ...textsFor(id, picks, seasons, metrics, profile, field),
    };
  });
  const winner = goalWinner(strategies, profile.goal);
  return strategies.map((s) => ({ ...s, fitsGoal: s.id === winner }));
}
