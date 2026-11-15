import "server-only";
import { cacheLife } from "next/cache";
import { decodePalettedPng, lonLatToGlobalPixel, parseGibsColormap, pixelValue, type ColorBin } from "@/shared/lib/gibs-raster";

/**
 * NASA SMAP L4 analyzed root-zone soil moisture (9 km, daily) at a point, read from NASA GIBS
 * paletted tiles through the official colormap (same method as gibs-ndvi.ts). No key needed.
 */
const LAYER = "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture";
const MATRIX = "GoogleMapsCompatible_Level6";
const ZOOM = 6;
const COLORMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Analyzed_Soil_Moisture.xml";

export interface SmapSample {
  /** Volumetric water in the root zone, m³/m³. */
  value: number;
  /** YYYY-MM-DD of the image GIBS served. */
  date: string | null;
}

async function colormap(): Promise<Array<[string, ColorBin]>> {
  "use cache";
  cacheLife("weeks");
  const res = await fetch(COLORMAP, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GIBS colormap responded ${res.status}`);
  return [...parseGibsColormap(await res.text()).entries()];
}

/** `time` = "default" (latest) or "YYYY-MM-DD". Uses the pixel under the point, or the mean of its valid neighbours. */
export async function sampleSmap(lat: number, lon: number, time: string): Promise<SmapSample | null> {
  "use cache";
  cacheLife("hours");

  const bins = new Map(await colormap());
  const [gx, gy] = lonLatToGlobalPixel(lon, lat, ZOOM).map(Math.floor);
  const tx = Math.floor(gx / 256);
  const ty = Math.floor(gy / 256);
  const res = await fetch(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAYER}/default/${time}/${MATRIX}/${ZOOM}/${ty}/${tx}.png`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const date = res.headers.get("layer-time-actual")?.slice(0, 10) ?? (time === "default" ? null : time);
  const img = decodePalettedPng(new Uint8Array(await res.arrayBuffer()));
  if (!img) return null;

  const px = gx - tx * 256;
  const py = gy - ty * 256;
  const centre = pixelValue(img, px, py, bins);
  if (centre !== null) return { value: Math.round(centre * 1000) / 1000, date };
  const around: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x > 255 || y > 255) continue;
      const v = pixelValue(img, x, y, bins);
      if (v !== null) around.push(v);
    }
  }
  return around.length ? { value: Math.round((around.reduce((a, b) => a + b, 0) / around.length) * 1000) / 1000, date } : null;
}
