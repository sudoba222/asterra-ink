import { cropById, historyOption } from "../../model/catalog";
import type { FarmerProfile } from "../../model/farmer-profile";
import type { ClimateContext, StrategyInput } from "../engine-types";
import { TEMPERATE, profile as mkProfile } from "./rotation-scenarios";

/** TEST FIXTURES ONLY — synthetic monthly water balance (mm), not data for a real place. */
export const DRY_SUMMER_RAIN = [60, 50, 50, 40, 30, 15, 5, 5, 20, 50, 60, 70];
export const ET0 = [10, 20, 45, 75, 110, 140, 160, 140, 95, 50, 20, 10];

/** Same temperatures as TEMPERATE, with a seasonal water series: dry, high-ET₀ summer. */
export const DRY_SUMMER: ClimateContext = { ...TEMPERATE, monthlyRain: DRY_SUMMER_RAIN, monthlyEt0: ET0 };
/** Rain ≥ ET₀ in every month: water is not limiting. */
export const WET: ClimateContext = { ...TEMPERATE, monthlyRain: ET0.map((e) => e + 40), monthlyEt0: ET0 };

export const SUMMER = [5, 6, 7, 8]; // Jun–Sep (0-based)

export function strategyInput(
  cropId: string,
  history: [string?, string?] = [],
  opts: { ctx?: ClimateContext; months?: number[]; profile?: Partial<FarmerProfile>; pestHistory?: boolean; irrigated?: boolean; rainfallShortageFlagged?: boolean } = {},
): StrategyInput {
  const crop = cropById(cropId);
  if (!crop) throw new Error(`unknown crop ${cropId}`);
  return {
    crop,
    profile: mkProfile(opts.profile ?? {}),
    ctx: opts.ctx ?? TEMPERATE,
    months: opts.months ?? SUMMER,
    history: { last: history[0] ? historyOption(history[0]) : null, before: history[1] ? historyOption(history[1]) : null },
    pestHistory: opts.pestHistory ?? false,
    irrigated: opts.irrigated ?? false,
    rainfallShortageFlagged: opts.rainfallShortageFlagged ?? false,
  };
}
