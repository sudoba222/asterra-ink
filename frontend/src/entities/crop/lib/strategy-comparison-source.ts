import type { FarmerProfile } from "../model/farmer-profile";
import { compareStrategies, type RotationStrategy } from "./compare-strategies";
import type { ClimateContext } from "./engine-types";
import type { FieldCalendar, FieldEvidence } from "./field-calendar";

/** What the rotation-strategy screen and the PDF report render. */
export interface StrategyComparison {
  strategies: RotationStrategy[];
  /** The field's last 12 months (bare / frost / hot / dry), drawn as the 12-month strip. Null without field data. */
  calendar: FieldCalendar | null;
}

/** The single data source for the three rotation strategies (screen + PDF read the same result). */
export function getStrategyComparison(profile: FarmerProfile, ctx: ClimateContext, field?: FieldEvidence): StrategyComparison {
  return { strategies: compareStrategies(profile, ctx, field), calendar: field?.calendar ?? null };
}

/** "Supports, not replaces": shown under the strategies on screen and in the PDF report. */
export const STRATEGY_DISCLAIMER =
  "ASTERRA suggests options from satellite and climate data. It does not replace your own experience or a local agronomist. Check the points marked “Check locally” before you change your rotation.";
