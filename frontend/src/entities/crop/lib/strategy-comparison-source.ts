import type { FarmerProfile } from "../model/farmer-profile";
import { compareStrategies, type RotationStrategy } from "./compare-strategies";
import type { ClimateContext } from "./engine-types";
import type { FieldEvidence } from "./field-calendar";

/** What the rotation-strategy screen and the PDF report render. */
export interface StrategyComparison {
  strategies: RotationStrategy[];
  /** True while the strategies are sample data: the UI then says so and doesn't present them as advice. */
  illustrative: boolean;
}

/**
 * The single data source for the three rotation strategies (screen + PDF read the same result).
 *
 * Takes the same arguments as `compareStrategies()` so switching to real data is a one-line change:
 *
 *   return { strategies: compareStrategies(profile, ctx, field), illustrative: false };
 *
 * Real data since the strategy logic landed: the farmer's answers + NASA/Copernicus field evidence.
 * `MOCK_ROTATION_STRATEGIES` stays available for tests and design work.
 */
export function getStrategyComparison(profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): StrategyComparison {
  return { strategies: compareStrategies(profile, ctx, field), illustrative: false };
}

/** "Supports, not replaces": shown under the strategies on screen and in the PDF report. */
export const STRATEGY_DISCLAIMER =
  "ASTERRA suggests options from satellite and climate data. It does not replace your own experience or a local agronomist. Check the points marked “Check locally” before you change your rotation.";
