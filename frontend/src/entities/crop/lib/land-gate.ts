import type { FarmerProfile } from "../model/farmer-profile";
import type { ClimateContext } from "./engine-types";
import { DEFAULT_STRATEGY_WEIGHTS, evaluateRotation, type EvaluateOptions, type RotationResult } from "./rotation-engine";

/**
 * The land check that must pass before the engine runs. Structural on purpose: it matches
 * `LandSuitability` from entities/land-suitability without this entity importing it.
 */
export interface LandVerdict {
  status: "suitable" | "unsuitable_land" | "uncertain";
  reason: string | null;
  message: string;
  warnings?: string[];
}

/** "ok" = land confirmed farmable · "land_uncertain" = shown with a caution · "unsuitable_land" = nothing is recommended. */
export type CropPlanStatus = "ok" | "land_uncertain" | "unsuitable_land";

/** `RotationResult` plus the land status, so existing readers of `candidates` keep working. */
export interface CropPlanResult extends RotationResult {
  status: CropPlanStatus;
  /** Land-check reason, e.g. "building_detected" or "land_cover_unavailable"; null when the land is fine. */
  reason: string | null;
  /** Farmer-facing land message; null when the land is fine. */
  message: string | null;
}

/** Used when the land check itself failed (request error), so nothing is known about the land. */
export const LAND_CHECK_FAILED: LandVerdict = {
  status: "uncertain",
  reason: "land_cover_unavailable",
  message: "We couldn’t check the land cover for this field right now, so we couldn’t confirm that it is farmland. Make sure the outline covers cultivated ground.",
};

/**
 * Runs the crop recommendation engine only for land that can be farmed.
 * - unsuitable land → no candidates, no scores, no notes; the engine is never called.
 * - uncertain land → the engine runs; the result carries the caution message.
 * Returns null while the climate data the engine needs is still missing.
 */
export function evaluateFieldRotation(
  profile: FarmerProfile,
  ctx: ClimateContext | null,
  land: LandVerdict,
  options: EvaluateOptions = {},
  engine: typeof evaluateRotation = evaluateRotation,
): CropPlanResult | null {
  if (land.status === "unsuitable_land") {
    return { status: "unsuitable_land", reason: land.reason, message: land.message, candidates: [], missingData: [], notes: [], weights: { ...DEFAULT_STRATEGY_WEIGHTS } };
  }
  if (!ctx) return null;
  const result = engine(profile, ctx, options);
  const uncertain = land.status === "uncertain";
  return {
    ...result,
    notes: [...(land.warnings ?? []), ...result.notes],
    status: uncertain ? "land_uncertain" : "ok",
    reason: uncertain ? land.reason : null,
    message: uncertain ? land.message : null,
  };
}
