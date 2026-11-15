import type { LonLat } from "../model/types";

const R = 6_378_137; // Web Mercator sphere radius, m
const NICE_LENGTHS_M = [5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000];

/** Lon/lat (°) → Web Mercator (EPSG:3857) metres. */
export function toWebMercator([lon, lat]: LonLat): [number, number] {
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return [(R * lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

export interface PhotoFrame {
  /** Square box in EPSG:3857: [xmin, ymin, xmax, ymax]. */
  bbox: [number, number, number, number];
  sizePx: number;
  /** Field corners in image pixels (origin top-left, north up). */
  points: Array<[number, number]>;
  /** Ground metres per image pixel at the field's latitude. */
  metresPerPx: number;
  scaleBar: { metres: number; px: number; label: string };
}

export interface PhotoFrameOptions {
  sizePx?: number;
  /** Margin around the field, as a fraction of its larger side (each side). */
  pad?: number;
  /** Smallest ground span shown, so tiny fields don't zoom past the imagery's resolution. */
  minSpanM?: number;
}

/**
 * Square satellite-photo frame around a field, in Web Mercator so it matches tiled imagery
 * (e.g. Esri World Imagery `export?bboxSR=3857`), plus the field outline in image pixels.
 */
export function fieldPhotoFrame(ring: LonLat[], { sizePx = 1200, pad = 0.35, minSpanM = 300 }: PhotoFrameOptions = {}): PhotoFrame {
  const merc = ring.map(toWebMercator);
  const xs = merc.map((p) => p[0]);
  const ys = merc.map((p) => p[1]);
  const lat = ring.reduce((s, p) => s + p[1], 0) / Math.max(ring.length, 1);
  // Mercator metres are stretched by 1/cos(lat) relative to ground metres.
  const stretch = 1 / Math.cos((lat * Math.PI) / 180);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const span = Math.max(side * (1 + 2 * pad), minSpanM * stretch);
  const half = span / 2;
  const bbox: PhotoFrame["bbox"] = [cx - half, cy - half, cx + half, cy + half];
  const k = sizePx / span;
  const points = merc.map(([x, y]) => [(x - bbox[0]) * k, (bbox[3] - y) * k] as [number, number]);
  const metresPerPx = span / stretch / sizePx;

  const target = sizePx * 0.22 * metresPerPx;
  const metres = NICE_LENGTHS_M.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best), NICE_LENGTHS_M[0]);
  return {
    bbox,
    sizePx,
    points,
    metresPerPx,
    scaleBar: { metres, px: metres / metresPerPx, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m` },
  };
}
