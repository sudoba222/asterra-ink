import { describe, expect, it } from "vitest";
import { classifyOsmTags, measureOsmCoverage, type OsmElement } from "./osm-coverage";

/* Geometry helpers in metres around a farm near Tashkent. */
const LAT0 = 41.3, LON0 = 69.2;
const M_LAT = 1 / 111_320;
const M_LON = 1 / (111_320 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): [number, number] => [LON0 + x * M_LON, LAT0 + y * M_LAT];
/** Open ring (as the field model stores it). */
const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
/** Closed OSM way. */
const closed = (r: Array<[number, number]>) => [...r, r[0]];

const FIELD = rect(0, 0, 100, 100); // 1 ha

describe("classifyOsmTags", () => {
  it("counts buildings, water, roads and non-farm land use", () => {
    expect(classifyOsmTags({ building: "yes" }, true)).toEqual({ cls: "building", shape: "area" });
    expect(classifyOsmTags({ natural: "water", water: "lake" }, true)).toEqual({ cls: "water", shape: "area" });
    expect(classifyOsmTags({ landuse: "reservoir" }, true)).toMatchObject({ cls: "water" });
    expect(classifyOsmTags({ waterway: "river" }, false)).toEqual({ cls: "water", shape: "line", halfWidthM: 10 });
    expect(classifyOsmTags({ highway: "primary" }, false)).toEqual({ cls: "infrastructure", shape: "line", halfWidthM: 7 });
    expect(classifyOsmTags({ amenity: "parking" }, true)).toMatchObject({ cls: "infrastructure", shape: "area" });
    expect(classifyOsmTags({ landuse: "industrial" }, true)).toEqual({ cls: "nonAgricultural", shape: "area", landUse: "industrial" });
  });

  it("uses mapped width and lanes for roads", () => {
    expect(classifyOsmTags({ highway: "secondary", width: "12" }, false)).toMatchObject({ halfWidthM: 6 });
    expect(classifyOsmTags({ highway: "secondary", lanes: "4" }, false)).toMatchObject({ halfWidthM: 7 });
  });

  it("ignores what does not stop cultivation", () => {
    expect(classifyOsmTags({ highway: "track" }, false)).toBeNull(); // farm track
    expect(classifyOsmTags({ highway: "path" }, false)).toBeNull();
    expect(classifyOsmTags({ waterway: "ditch" }, false)).toBeNull(); // irrigation ditch
    expect(classifyOsmTags({ highway: "motorway", tunnel: "yes" }, false)).toBeNull();
    expect(classifyOsmTags({ waterway: "canal", tunnel: "culvert" }, false)).toBeNull();
    expect(classifyOsmTags({ natural: "water", intermittent: "yes" }, true)).toBeNull();
    expect(classifyOsmTags({ landuse: "farmland" }, true)).toBeNull();
    expect(classifyOsmTags({ landuse: "forest" }, true)).toBeNull();
    expect(classifyOsmTags({ building: "no" }, true)).toBeNull();
    expect(classifyOsmTags({ building: "yes" }, false)).toBeNull(); // an unclosed outline is not an area
  });

  it("treats residential land as a note, not a block (household plots are farmed)", () => {
    expect(classifyOsmTags({ landuse: "residential" }, true)).toEqual({ cls: "residential", shape: "area" });
  });
});

describe("measureOsmCoverage", () => {
  it("reports no cover for an empty map", () => {
    const c = measureOsmCoverage(FIELD, []);
    expect(c.blocked).toBe(0);
    expect(c.features).toBe(0);
    expect(c.samples).toBeGreaterThan(1000);
    expect(c.spacingM).toBeGreaterThanOrEqual(1);
  });

  it("measures the polygon, not the centre: a building on one half covers ~50%", () => {
    const el: OsmElement = { tags: { building: "yes" }, paths: [closed(rect(-10, -10, 50, 110))] };
    const c = measureOsmCoverage(FIELD, [el]);
    expect(c.shares.building).toBeGreaterThan(0.45);
    expect(c.shares.building).toBeLessThan(0.55);
    expect(c.features).toBe(1);
  });

  it("finds a building that misses the centre", () => {
    const el: OsmElement = { tags: { building: "yes" }, paths: [closed(rect(0, 0, 20, 20))] };
    const c = measureOsmCoverage(FIELD, [el]);
    expect(c.shares.building).toBeGreaterThan(0.02);
    expect(c.shares.building).toBeLessThan(0.06);
  });

  it("covers a field drawn on a building completely", () => {
    const house = rect(10, 10, 30, 25);
    const el: OsmElement = { tags: { building: "house" }, paths: [closed(rect(0, 0, 40, 35))] };
    expect(measureOsmCoverage(house, [el]).shares.building).toBe(1);
  });

  it("detects a lake that encloses the whole field", () => {
    const lake: OsmElement = { tags: { natural: "water" }, paths: [closed(rect(-2000, -2000, 2000, 2000))] };
    const c = measureOsmCoverage(FIELD, [lake]);
    expect(c.shares.water).toBe(1);
    expect(c.blocked).toBe(1);
  });

  it("respects inner rings of multipolygons (an island is not water)", () => {
    const lake: OsmElement = {
      tags: { natural: "water", type: "multipolygon" },
      paths: [closed(rect(-2000, -2000, 2000, 2000)), closed(rect(-50, -50, 150, 150))],
    };
    expect(measureOsmCoverage(FIELD, [lake]).shares.water).toBe(0);
  });

  it("buffers a road by half its width", () => {
    // A 14 m primary road along the middle of a 100 m field ≈ 14% cover.
    const road: OsmElement = { tags: { highway: "primary" }, paths: [[at(-50, 50), at(150, 50)]] };
    const c = measureOsmCoverage(FIELD, [road]);
    expect(c.shares.infrastructure).toBeGreaterThan(0.11);
    expect(c.shares.infrastructure).toBeLessThan(0.17);
  });

  it("counts a point once in `blocked` when classes overlap", () => {
    const zone: OsmElement = { tags: { landuse: "industrial" }, paths: [closed(rect(-10, -10, 110, 110))] };
    const shed: OsmElement = { tags: { building: "industrial" }, paths: [closed(rect(-10, -10, 50, 110))] };
    const c = measureOsmCoverage(FIELD, [zone, shed]);
    expect(c.shares.nonAgricultural).toBe(1);
    expect(c.shares.building).toBeGreaterThan(0.45);
    expect(c.blocked).toBe(1);
    expect(c.landUse).toBe("industrial");
  });

  it("tracks residential land separately", () => {
    const village: OsmElement = { tags: { landuse: "residential" }, paths: [closed(rect(-500, -500, 500, 500))] };
    const c = measureOsmCoverage(FIELD, [village]);
    expect(c.residential).toBe(1);
    expect(c.blocked).toBe(0);
  });

  it("handles a field smaller than the sampling grid", () => {
    const tiny = rect(0, 0, 0.5, 0.5);
    const el: OsmElement = { tags: { building: "yes" }, paths: [closed(rect(-5, -5, 5, 5))] };
    const c = measureOsmCoverage(tiny, [el]);
    expect(c.samples).toBe(1);
    expect(c.shares.building).toBe(1);
  });
});
