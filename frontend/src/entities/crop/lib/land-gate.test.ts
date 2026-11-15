import { describe, expect, it, vi } from "vitest";
import { TEMPERATE, profile } from "./__fixtures__/rotation-scenarios";
import { LAND_CHECK_FAILED, evaluateFieldRotation, type LandVerdict } from "./land-gate";
import { evaluateRotation } from "./rotation-engine";

const SUITABLE: LandVerdict = { status: "suitable", reason: null, message: "This area looks like open land that can be farmed." };
const BUILDING: LandVerdict = {
  status: "unsuitable_land",
  reason: "building_detected",
  message: "Crop recommendations are unavailable. The selected area contains a building and is not suitable for agricultural cultivation.",
};

describe("evaluateFieldRotation", () => {
  it("never runs the engine on unsuitable land and returns no candidates, scores or notes", () => {
    const engine = vi.fn(evaluateRotation);
    const r = evaluateFieldRotation(profile({}), TEMPERATE, BUILDING, {}, engine);
    expect(engine).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "unsuitable_land", reason: "building_detected", message: BUILDING.message, candidates: [], notes: [], missingData: [] });
  });

  it("answers for unsuitable land even before climate data arrives", () => {
    expect(evaluateFieldRotation(profile({}), null, BUILDING)?.status).toBe("unsuitable_land");
  });

  it("waits for climate data on farmable land", () => {
    expect(evaluateFieldRotation(profile({}), null, SUITABLE)).toBeNull();
  });

  it("returns the engine's result unchanged on suitable land, plus status", () => {
    const r = evaluateFieldRotation(profile({}), TEMPERATE, SUITABLE)!;
    const plain = evaluateRotation(profile({}), TEMPERATE);
    expect(r.status).toBe("ok");
    expect(r.reason).toBeNull();
    expect(r.message).toBeNull();
    expect(r.candidates).toEqual(plain.candidates);
    expect(r.notes).toEqual(plain.notes);
  });

  it("still recommends on uncertain land, but carries the caution", () => {
    const r = evaluateFieldRotation(profile({}), TEMPERATE, LAND_CHECK_FAILED)!;
    expect(r.status).toBe("land_uncertain");
    expect(r.reason).toBe("land_cover_unavailable");
    expect(r.message).toBe(LAND_CHECK_FAILED.message);
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it("puts land notes (e.g. part of the field is a building) first", () => {
    const r = evaluateFieldRotation(profile({}), TEMPERATE, { ...SUITABLE, warnings: ["About 20% of the field is buildings on the map."] })!;
    expect(r.notes[0]).toBe("About 20% of the field is buildings on the map.");
  });
});
