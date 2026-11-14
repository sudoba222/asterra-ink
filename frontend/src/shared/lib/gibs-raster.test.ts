import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePalettedPng, globalPixelToLonLat, lonLatToGlobalPixel, parseGibsColormap, pixelValue } from "./gibs-raster";

const fx = (f: string) => readFileSync(join(__dirname, "__fixtures__", f));

describe("GIBS paletted PNG → data", () => {
  // Real tile: MODIS_Terra_NDVI_8Day, GoogleMapsCompatible_Level9, z9 row 188 col 355.
  const img = decodePalettedPng(new Uint8Array(fx("gibs-modis-ndvi-z9-188-355.png")))!;
  const bins = parseGibsColormap(fx("gibs-colormap-MODIS_NDVI.xml").toString("utf8"));

  it("decodes a 256×256 palette image", () => {
    expect(img).not.toBeNull();
    expect(img.width).toBe(256);
    expect(img.height).toBe(256);
    expect(img.indices.length).toBe(256 * 256);
  });

  it("maps every opaque pixel colour to a colormap bin", () => {
    let opaque = 0;
    let unmatched = 0;
    for (let i = 0; i < img.indices.length; i++) {
      const p = img.indices[i];
      if (img.alpha[p] === 0) continue;
      opaque++;
      const key = `${img.palette[p * 3]},${img.palette[p * 3 + 1]},${img.palette[p * 3 + 2]}`;
      if (!bins.has(key)) unmatched++;
    }
    expect(opaque).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });

  it("returns NDVI values within the physical range", () => {
    const values: number[] = [];
    for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
      const v = pixelValue(img, x, y, bins);
      if (v !== null) values.push(v);
    }
    expect(values.length).toBeGreaterThan(10);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(-0.3);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("parses colormap bins with 0.005 NDVI resolution", () => {
    const b = bins.get("241,236,236");
    expect(b?.min).toBeCloseTo(0.0001, 4);
    expect(b?.max).toBeCloseTo(0.0051, 4);
  });
});

describe("Web Mercator pixel math", () => {
  it("round-trips lon/lat ↔ pixel", () => {
    const [x, y] = lonLatToGlobalPixel(69.24, 41.31, 9);
    const [lon, lat] = globalPixelToLonLat(x, y, 9);
    expect(lon).toBeCloseTo(69.24, 6);
    expect(lat).toBeCloseTo(41.31, 6);
  });

  it("matches the standard slippy-map tile formula", () => {
    // Independent reference: OSM wiki "Slippy map tilenames".
    const tile = (lon: number, lat: number, z: number) => {
      const n = 2 ** z;
      const r = (lat * Math.PI) / 180;
      return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
    };
    for (const [lon, lat] of [[70, 45], [69.24, 41.31], [-47.9, -15.8], [2.35, 48.85]]) {
      const [x, y] = lonLatToGlobalPixel(lon, lat, 9);
      expect([Math.floor(x / 256), Math.floor(y / 256)]).toEqual(tile(lon, lat, 9));
    }
  });
});
