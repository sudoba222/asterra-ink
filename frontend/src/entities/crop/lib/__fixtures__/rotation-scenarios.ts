import { EMPTY_PROFILE, type FarmerProfile } from "../../model/farmer-profile";
import type { ClimateContext } from "../rotation-engine";

/**
 * TEST FIXTURES ONLY — synthetic monthly climate, not measurements of any real place.
 * Shapes match what `climateContext()` builds from the NASA POWER profile.
 */

/** Mid-latitude, northern-hemisphere-like temperature curve (°C). */
const TEMPERATE_T = [2, 4, 8, 13, 18, 22, 25, 24, 19, 13, 7, 3];
const TEMPERATE_TMIN = [-6, -5, -2, 3, 8, 12, 15, 14, 9, 3, -2, -5];

/** Legacy-shaped context: no seasonal water series (as before this change). */
export const TEMPERATE: ClimateContext = {
  monthlyTemp: TEMPERATE_T,
  monthlyTmin: TEMPERATE_TMIN,
  annualRainfall: 650,
  status: "live",
};

export const HOT: ClimateContext = {
  monthlyTemp: [20, 22, 25, 28, 31, 33, 34, 33, 31, 28, 24, 21],
  monthlyTmin: [8, 10, 13, 16, 20, 23, 25, 24, 21, 16, 12, 9],
  annualRainfall: 700,
  status: "live",
};

export function profile(p: Partial<FarmerProfile>): FarmerProfile {
  return { ...EMPTY_PROFILE, ...p };
}

/** Scenarios used for the legacy regression fixture (no seasonal water data in context). */
export const LEGACY_SCENARIOS: Array<{ name: string; profile: FarmerProfile; ctx: ClimateContext }> = [
  { name: "empty profile", profile: profile({}), ctx: TEMPERATE },
  { name: "wheat after maize, rainfed", profile: profile({ previousCrops: ["wheat", "maize"], irrigation: "rainfed" }), ctx: TEMPERATE },
  { name: "soybean after wheat, irrigated, soil goal", profile: profile({ previousCrops: ["soybean", "wheat"], irrigation: "irrigated", goal: "soil" }), ctx: TEMPERATE },
  {
    name: "potato twice, pests, clay, risk goal",
    profile: profile({ previousCrops: ["potato", "potato"], issues: ["pests"], soilType: "clay", goal: "risk", plantingMonth: 4 }),
    ctx: TEMPERATE,
  },
  {
    name: "maize after sunflower, water goal, sandy, salinity",
    profile: profile({ previousCrops: ["maize", "sunflower"], goal: "water", soilType: "sandy", issues: ["salinity"], irrigation: "rainfed" }),
    ctx: TEMPERATE,
  },
  { name: "chickpea, before unknown, April, profit", profile: profile({ previousCrops: ["chickpea", "unknown"], plantingMonth: 4, goal: "profit" }), ctx: TEMPERATE },
  { name: "cotton after fallow, hot", profile: profile({ previousCrops: ["cotton", "fallow"], irrigation: "both" }), ctx: HOT },
  { name: "sample climate, no history", profile: profile({ previousCrops: ["unknown", ""] }), ctx: { ...TEMPERATE, status: "sample" } },
];
