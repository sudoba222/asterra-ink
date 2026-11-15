import type { Crop, HistoryOption } from "../model/catalog";
import type { FarmerProfile } from "../model/farmer-profile";

export interface ClimateContext {
  /** Mean temperature per calendar month (index 0 = Jan), °C. */
  monthlyTemp: Array<number | null>;
  /** Lowest hourly temperature per calendar month (POWER T2M_MIN, monthly), °C. */
  monthlyTmin: Array<number | null>;
  annualRainfall: number | null;
  status: "live" | "sample" | "derived" | "unavailable";
  /** Precipitation per calendar month, mm (POWER PRECTOTCORR). Optional: older callers omit it. */
  monthlyRain?: Array<number | null>;
  /** Reference evapotranspiration ET₀ per calendar month, mm (FAO-56 Hargreaves from POWER). */
  monthlyEt0?: Array<number | null>;
  /** Root-zone soil wetness per calendar month, % of saturation (POWER GWETROOT × 100). */
  monthlySoilMoisture?: Array<number | null>;
  /** Hottest hour of each calendar month, °C (POWER monthly T2M_MAX is the month's peak). Optional. */
  monthlyTmax?: Array<number | null>;
}

export type CheckKind = "pass" | "warn" | "fail" | "note";

export interface Check {
  kind: CheckKind;
  rule: string;
  text: string;
}

export type StrategyId = "legume" | "family" | "water";

/** Multipliers applied to each strategy's raw points. 1 = documented points; 0 = strategy off. */
export type StrategyWeights = Record<StrategyId, number>;

/** The last two reported seasons, resolved against the catalog (null = not answered / "Don't know"). */
export interface SeasonHistory {
  last: HistoryOption | null;
  before: HistoryOption | null;
}

/** Everything a strategy may look at for one candidate. Strategies are pure functions of this. */
export interface StrategyInput {
  crop: Crop;
  profile: FarmerProfile;
  ctx: ClimateContext;
  /** Calendar months (0–11) of the candidate's growing season. */
  months: number[];
  history: SeasonHistory;
  pestHistory: boolean;
  irrigated: boolean;
  /** The base annual-rainfall check already flagged this crop as short of water. */
  rainfallShortageFlagged: boolean;
}

export interface StrategyOutcome {
  id: StrategyId;
  /** Raw points from the strategy's documented rule table. */
  points: number;
  checks: Check[];
  /** False when the inputs it needs (history, climate series) are missing — points are then 0. */
  applicable: boolean;
}

/** Documented raw-point range of a component; used to normalise to [-1, 1]. */
export interface PointRange {
  min: number;
  max: number;
}

export interface ScoreComponent {
  id: "base" | StrategyId;
  label: string;
  /** Raw points before weighting. */
  points: number;
  weight: number;
  /** points × weight — what actually enters `score`. */
  weighted: number;
  /** points scaled into [-1, 1] by the component's documented range (positive ÷ max, negative ÷ |min|). */
  normalized: number;
  applicable: boolean;
}

export type { Crop, FarmerProfile, HistoryOption };
