import type { FarmerProfile } from "../model/farmer-profile";
import type { RotationStrategy } from "./compare-strategies";
import type { ClimateContext } from "./engine-types";
import type { FieldEvidence } from "./field-calendar";
import { MOCK_ROTATION_STRATEGIES } from "./mock-rotation-strategies";

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
 * Until then it returns the illustrative sample, which does not react to the farmer's answers.
 */
export function getStrategyComparison(profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): StrategyComparison {
  void profile;
  void ctx;
  void field;
  return { strategies: MOCK_ROTATION_STRATEGIES, illustrative: true };
}
