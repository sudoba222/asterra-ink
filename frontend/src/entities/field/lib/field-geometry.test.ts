import { describe, expect, it } from "vitest";
import type { LonLat } from "../model/types";
import { areaHectares } from "./area";
import { isSelfIntersecting, validateField } from "./validate";

/** Square of `sideM` metres centred at lat/lon (small-area approximation for the test input). */
function square(lat: number, lon: number, sideM: number): LonLat[] {
  const dLat = sideM / 111_320 / 2;
  const dLon = sideM / (111_320 * Math.cos((lat * Math.PI) / 180)) / 2;
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
  ];
}

describe("field area (ha)", () => {
  it("100 m × 100 m at the equator ≈ 1 ha", () => {
    expect(areaHectares(square(0, 30, 100))).toBeCloseTo(1, 1);
  });
  it("100 m × 100 m at 60°N ≈ 1 ha", () => {
    expect(Math.abs(areaHectares(square(60, 10, 100)) - 1)).toBeLessThan(0.01);
  });
  it("1 km × 1 km in Uzbekistan ≈ 100 ha", () => {
    expect(Math.abs(areaHectares(square(41.3, 69.2, 1000)) - 100) / 100).toBeLessThan(0.01);
  });
  it("matches an independent planar calculation for a real drawn field (Chinaz, UZ)", () => {
    // Polygon saved by the end-to-end test; reference 176.80 ha from a local equirectangular
    // projection + shoelace with R = 6371008.8 m (computed separately in Python).
    const ring: LonLat[] = [
      [68.70448847048185, 40.98715450549153],
      [68.7125626238445, 40.989053004143415],
      [68.72063618816514, 40.98588770520354],
      [68.72174723034425, 40.97576096437529],
      [68.70727204105913, 40.975129449711915],
    ];
    expect(Math.abs(areaHectares(ring) - 176.8) / 176.8).toBeLessThan(0.001);
  });

  it("is independent of winding order", () => {
    const sq = square(-20, -50, 300);
    expect(areaHectares([...sq].reverse())).toBeCloseTo(areaHectares(sq), 8);
  });
});

describe("field validation", () => {
  it("accepts a simple quadrilateral", () => {
    expect(validateField(square(41.3, 69.2, 200))).toBeNull();
  });
  it("rejects a bow-tie", () => {
    const [a, b, c, d] = square(41.3, 69.2, 200);
    const bowTie: LonLat[] = [a, c, b, d];
    expect(isSelfIntersecting(bowTie)).toBe(true);
    expect(validateField(bowTie)).toBe("self-intersecting");
  });
  it("needs 3 corners and a minimum size", () => {
    expect(validateField(square(0, 0, 100).slice(0, 2))).toBe("too-few-points");
    expect(validateField(square(0, 0, 5))).toBe("too-small");
  });
});
