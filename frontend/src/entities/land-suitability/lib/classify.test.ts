import { describe, expect, it } from "vitest";
import type { OsmCoverage, WorldCoverSample } from "../model/types";
import { classifyLand } from "./classify";
import { worldCoverShares } from "./worldcover";

function osm(shares: Partial<OsmCoverage["shares"]> = {}, extra: Partial<OsmCoverage> = {}): OsmCoverage {
  const s = { building: 0, water: 0, infrastructure: 0, nonAgricultural: 0, ...shares };
  return { shares: s, blocked: Math.min(1, s.building + s.water + s.infrastructure + s.nonAgricultural), residential: 0, landUse: null, samples: 2500, spacingM: 2, features: 0, ...extra };
}

/** Shares given as class value → share, e.g. { 40: 0.9, 50: 0.1 }. */
function wc(byValue: Record<number, number>, extra: Partial<WorldCoverSample> = {}): WorldCoverSample {
  const counts = Object.fromEntries(Object.entries(byValue).map(([k, v]) => [k, Math.round(v * 1000)]));
  return { shares: worldCoverShares(counts, 1000), pixels: 1000, resolutionM: 10, smallerThanPixel: false, ...extra };
}

const CROPLAND = wc({ 40: 1 });

describe("classifyLand", () => {
  it("passes open cropland", () => {
    const d = classifyLand({ osm: osm(), worldCover: CROPLAND });
    expect(d.status).toBe("suitable");
    expect(d.reason).toBeNull();
    expect(d.warnings).toEqual([]);
  });

  it("does not block forest, grassland or bare land (only land cover that rules out farming counts)", () => {
    for (const v of [10, 30, 60, 90]) expect(classifyLand({ osm: osm(), worldCover: wc({ [v]: 1 }) }).status).toBe("suitable");
  });

  describe("unsuitable land", () => {
    it("building → the building message, no hedging", () => {
      const d = classifyLand({ osm: osm({ building: 0.85 }), worldCover: wc({ 50: 0.9, 40: 0.1 }) });
      expect(d).toMatchObject({
        status: "unsuitable_land",
        reason: "building_detected",
        message: "Crop recommendations are unavailable. The selected area contains a building and is not suitable for agricultural cultivation.",
        warnings: [],
      });
    });

    it("water from the map", () => {
      const d = classifyLand({ osm: osm({ water: 1 }), worldCover: wc({ 80: 1 }) });
      expect(d).toMatchObject({ status: "unsuitable_land", reason: "water_detected", message: "Crop recommendations are unavailable. The selected area is covered by water." });
    });

    it("water from satellite land cover alone (e.g. a lake mapped only by its shoreline)", () => {
      expect(classifyLand({ osm: osm(), worldCover: wc({ 80: 0.92, 40: 0.08 }) })).toMatchObject({ status: "unsuitable_land", reason: "water_detected" });
      expect(classifyLand({ osm: null, worldCover: wc({ 80: 0.8, 30: 0.2 }) })).toMatchObject({ status: "unsuitable_land", reason: "water_detected" });
    });

    it("roads and paved surfaces → infrastructure", () => {
      const d = classifyLand({ osm: osm({ infrastructure: 0.7 }), worldCover: wc({ 50: 0.8, 40: 0.2 }) });
      expect(d).toMatchObject({
        status: "unsuitable_land",
        reason: "infrastructure_detected",
        message: "Crop recommendations are unavailable. The selected area is covered by infrastructure and cannot be used for agricultural cultivation.",
      });
    });

    it("non-farm land use names the land use", () => {
      const d = classifyLand({ osm: osm({ nonAgricultural: 1 }, { landUse: "cemetery" }), worldCover: wc({ 30: 1 }) });
      expect(d.reason).toBe("non_agricultural_land_use");
      expect(d.message).toContain("mapped as a cemetery");
    });

    it("built-up satellite land cover when the map has no data to contradict it", () => {
      expect(classifyLand({ osm: null, worldCover: wc({ 50: 0.9, 40: 0.1 }) })).toMatchObject({ status: "unsuitable_land", reason: "built_up_area_detected" });
    });

    it("both sources agreeing below their single-source thresholds", () => {
      const d = classifyLand({ osm: osm({ building: 0.35 }), worldCover: wc({ 50: 0.55, 40: 0.45 }) });
      expect(d).toMatchObject({ status: "unsuitable_land", reason: "building_detected" });
    });

    it("permanent snow and ice", () => {
      const d = classifyLand({ osm: osm(), worldCover: wc({ 70: 0.95, 60: 0.05 }) });
      expect(d.status).toBe("unsuitable_land");
      expect(d.message).toBe("Crop recommendations are unavailable. The selected area is covered by permanent snow or ice.");
    });

    it("explains the decision with measured shares", () => {
      const d = classifyLand({ osm: osm({ building: 0.85 }), worldCover: wc({ 50: 0.9, 40: 0.1 }) });
      expect(d.evidence.join(" ")).toMatch(/buildings on 85% of the field/);
      expect(d.evidence.join(" ")).toMatch(/built-up 90%/);
    });
  });

  describe("uncertain, never a false 'unsuitable'", () => {
    it("no data at all", () => {
      expect(classifyLand({ osm: null, worldCover: null })).toMatchObject({ status: "uncertain", reason: "land_cover_unavailable" });
    });

    it("satellite land cover missing, even if the map looks clear", () => {
      expect(classifyLand({ osm: osm(), worldCover: null })).toMatchObject({ status: "uncertain", reason: "land_cover_unavailable" });
    });

    it("satellite says built-up but the map shows nothing (e.g. plastic greenhouses)", () => {
      expect(classifyLand({ osm: osm(), worldCover: wc({ 50: 0.85, 40: 0.15 }) })).toMatchObject({ status: "uncertain", reason: "sources_disagree" });
    });

    it("map says industrial but the satellite sees cropland", () => {
      const d = classifyLand({ osm: osm({ nonAgricultural: 1 }, { landUse: "industrial" }), worldCover: wc({ 40: 0.8, 50: 0.2 }) });
      expect(d).toMatchObject({ status: "uncertain", reason: "sources_disagree" });
    });

    it("map data missing and the satellite does not see cropland (roads under trees are invisible at 10 m)", () => {
      expect(classifyLand({ osm: null, worldCover: wc({ 10: 0.84, 50: 0.16 }) })).toMatchObject({ status: "uncertain", reason: "land_cover_unavailable" });
    });

    it("mixed cover between the thresholds", () => {
      expect(classifyLand({ osm: osm(), worldCover: wc({ 50: 0.55, 40: 0.45 }) })).toMatchObject({ status: "uncertain", reason: "mixed_land_cover" });
    });

    it("is never decided by climate — there is no climate input at all", () => {
      expect(classifyLand.length).toBe(1);
    });
  });

  describe("partial cover", () => {
    it("a farmhouse on part of the field is a note, not a block", () => {
      const d = classifyLand({ osm: osm({ building: 0.2 }), worldCover: wc({ 40: 0.8, 50: 0.2 }) });
      expect(d.status).toBe("suitable");
      expect(d.warnings[0]).toMatch(/About 20% of the field is buildings/);
    });

    it("a household plot in a residential area is fine, with a note", () => {
      const d = classifyLand({ osm: osm({}, { residential: 1 }), worldCover: wc({ 40: 0.7, 30: 0.3 }) });
      expect(d.status).toBe("suitable");
      expect(d.warnings[0]).toMatch(/residential area/);
    });

    it("says when the map could not be checked", () => {
      const d = classifyLand({ osm: null, worldCover: CROPLAND });
      expect(d.status).toBe("suitable");
      expect(d.warnings.join(" ")).toMatch(/satellite land cover only/);
    });
  });
});
