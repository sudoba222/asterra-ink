import { lonLatToGlobalPixel } from "./gibs-raster";
import type { RgbaImage } from "./rgba-png";

/** Pixel rectangle [x0, x1) × [y0, y1) inside one 256-px Web Mercator tile. */
export interface TileWindow {
  zoom: number;
  tileX: number;
  tileY: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The box's pixels inside the tile that holds its centre, at least `minPx` wide and tall
 * (so a tiny field isn't judged on one or two pixels). Clipped to the tile.
 */
export function boxWindow(b: { west: number; south: number; east: number; north: number }, zoom: number, minPx = 12): TileWindow {
  const [cx, cy] = lonLatToGlobalPixel((b.west + b.east) / 2, (b.south + b.north) / 2, zoom);
  const tileX = Math.floor(cx / 256);
  const tileY = Math.floor(cy / 256);
  const [wx, ny] = lonLatToGlobalPixel(b.west, b.north, zoom);
  const [ex, sy] = lonLatToGlobalPixel(b.east, b.south, zoom);
  const half = minPx / 2;
  const clamp = (v: number) => Math.max(0, Math.min(256, Math.round(v)));
  return {
    zoom,
    tileX,
    tileY,
    x0: clamp(Math.min(wx, cx - half) - tileX * 256),
    x1: clamp(Math.max(ex, cx + half) - tileX * 256),
    y0: clamp(Math.min(ny, cy - half) - tileY * 256),
    y1: clamp(Math.max(sy, cy + half) - tileY * 256),
  };
}

/**
 * Share of the window that is real imagery (alpha ≥ 128) and not cloud.
 * A pixel is cloud (or snow/haze) when all three bands are ≥ `cloudMinRgb`.
 */
export function clearShare(img: RgbaImage, w: TileWindow, cloudMinRgb: number): number {
  let total = 0;
  let clear = 0;
  for (let y = w.y0; y < w.y1; y++) {
    for (let x = w.x0; x < w.x1; x++) {
      const o = (y * img.width + x) * 4;
      total++;
      if (img.pixels[o + 3] < 128) continue;
      if (Math.min(img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]) >= cloudMinRgb) continue;
      clear++;
    }
  }
  return total ? clear / total : 0;
}
