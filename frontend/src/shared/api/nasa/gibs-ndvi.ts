import "server-only";
import { cacheLife } from "next/cache";
import {
  decodePalettedPng,
  globalPixelToLonLat,
  lonLatToGlobalPixel,
  parseGibsColormap,
  pixelValue,
  type ColorBin,
  type PalettedImage,
} from "@/shared/lib/gibs-raster";

/**
 * Field-level NDVI from NASA GIBS MODIS Terra NDVI (rolling 8-day, 250 m) tiles.
 * Pixels whose centre lies inside the farmer's polygon are reverse-mapped through
 * the official colormap. Fields smaller than a pixel use the pixel under the centroid.
 */
const LAYER = "MODIS_Terra_NDVI_8Day";
const MATRIX = "GoogleMapsCompatible_Level9";
const ZOOM = 9;
const COLORMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml";
const MAX_TILES = 16;

export interface NdviSample {
  mean: number;
  min: number;
  max: number;
  pixels: number;
  smallerThanPixel: boolean;
  date: string | null;
  layer: string;
  resolution: string;
}

async function colormap(): Promise<Array<[string, ColorBin]>> {
  "use cache";
  cacheLife("weeks");
  const res = await fetch(COLORMAP, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GIBS colormap responded ${res.status}`);
  return [...parseGibsColormap(await res.text()).entries()];
}

function tileUrl(time: string, x: number, y: number) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAYER}/default/${time}/${MATRIX}/${ZOOM}/${y}/${x}.png`;
}

function inRing(lon: number, lat: number, ring: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** `time` = "default" (latest available) or "YYYY-MM-DD". Returns null when no valid pixels. */
export async function sampleNdvi(ring: Array<[number, number]>, time: string): Promise<NdviSample | null> {
  "use cache";
  cacheLife("hours");

  const bins = new Map(await colormap());
  const pts = ring.map(([lon, lat]) => lonLatToGlobalPixel(lon, lat, ZOOM));
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])));
  const maxX = Math.floor(Math.max(...pts.map((p) => p[0])));
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const maxY = Math.floor(Math.max(...pts.map((p) => p[1])));
  const tx0 = Math.floor(minX / 256), tx1 = Math.floor(maxX / 256);
  const ty0 = Math.floor(minY / 256), ty1 = Math.floor(maxY / 256);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > MAX_TILES) throw new Error("Field too large to sample");

  const tiles = new Map<string, PalettedImage | null>();
  let date: string | null = null;
  await Promise.all(
    Array.from({ length: (tx1 - tx0 + 1) * (ty1 - ty0 + 1) }, (_, k) => {
      const tx = tx0 + (k % (tx1 - tx0 + 1));
      const ty = ty0 + Math.floor(k / (tx1 - tx0 + 1));
      return fetch(tileUrl(time, tx, ty), { signal: AbortSignal.timeout(20_000) }).then(async (res) => {
        if (!res.ok) return tiles.set(`${tx},${ty}`, null);
        date ??= res.headers.get("layer-time-actual")?.slice(0, 10) ?? null;
        tiles.set(`${tx},${ty}`, decodePalettedPng(new Uint8Array(await res.arrayBuffer())));
      });
    }),
  );

  const valueAt = (gx: number, gy: number) => {
    const img = tiles.get(`${Math.floor(gx / 256)},${Math.floor(gy / 256)}`);
    return img ? pixelValue(img, gx % 256, gy % 256, bins) : null;
  };

  const values: number[] = [];
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const [lon, lat] = globalPixelToLonLat(gx + 0.5, gy + 0.5, ZOOM);
      if (!inRing(lon, lat, ring)) continue;
      const v = valueAt(gx, gy);
      if (v !== null) values.push(v);
    }
  }

  let smallerThanPixel = false;
  if (values.length === 0) {
    // Field smaller than one 250 m pixel (or between centres): use the pixel under the vertex mean.
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const v = valueAt(Math.floor(cx), Math.floor(cy));
    if (v === null) return null;
    values.push(v);
    smallerThanPixel = true;
  }

  return {
    mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000,
    min: Math.min(...values),
    max: Math.max(...values),
    pixels: values.length,
    smallerThanPixel,
    date,
    layer: LAYER,
    resolution: "≈250 m (MODIS)",
  };
}
