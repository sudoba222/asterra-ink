import { describe, expect, it } from "vitest";
import type { LonLat } from "../model/types";
import { fieldPhotoFrame, toWebMercator } from "./photo-frame";

/** Square of `sideM` metres centred at lat/lon. */
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

describe("fieldPhotoFrame", () => {
  it("returns a square Web Mercator box that contains the field with padding", () => {
    const ring = square(41.3, 69.25, 800);
    const f = fieldPhotoFrame(ring, { sizePx: 1000, pad: 0.25 });
    const [x0, y0, x1, y1] = f.bbox;
    expect(x1 - x0).toBeCloseTo(y1 - y0, 6);
    for (const p of ring) {
      const [x, y] = toWebMercator(p);
      expect(x).toBeGreaterThan(x0);
      expect(x).toBeLessThan(x1);
      expect(y).toBeGreaterThan(y0);
      expect(y).toBeLessThan(y1);
    }
    // field fills 1 / (1 + 2·0.25) of the frame
    const px = f.points.map((p) => p[0]);
    expect(Math.max(...px) - Math.min(...px)).toBeCloseTo(1000 / 1.5, 0);
  });

  it("puts north at the top", () => {
    const f = fieldPhotoFrame(square(10, 10, 500));
    // square() lists the southern corners first → larger y
    expect(f.points[0][1]).toBeGreaterThan(f.points[2][1]);
  });

  it("measures ground metres per pixel and enforces the minimum span for tiny fields", () => {
    const f = fieldPhotoFrame(square(60, 10, 20), { sizePx: 1000, minSpanM: 300 });
    expect(f.metresPerPx * 1000).toBeCloseTo(300, 0);
  });

  it("picks a round scale bar about a fifth of the width", () => {
    const f = fieldPhotoFrame(square(41.3, 69.25, 1000), { sizePx: 1200, pad: 0.35 });
    expect([100, 200, 500]).toContain(f.scaleBar.metres);
    expect(f.scaleBar.px / 1200).toBeGreaterThan(0.1);
    expect(f.scaleBar.px / 1200).toBeLessThan(0.4);
    expect(f.scaleBar.label).toBe(`${f.scaleBar.metres} m`);
  });
});
