import "server-only";
import { cacheLife } from "next/cache";
import { CogHeaderTruncatedError, decodeTile, parseCogHeader, tileRange, type CogHeader } from "@/shared/lib/cog-raster";

/**
 * ESA WorldCover 10 m 2021 (v200) land cover, read straight from the public Cloud-Optimised
 * GeoTIFFs on AWS Open Data (no key). Only the header and the 1024² tiles under the field are
 * downloaded. Pixels whose centre lies inside the polygon are counted per class.
 * Licence: CC BY 4.0 — © ESA WorldCover project / Contains modified Copernicus Sentinel data (2021).
 */
const BASE = process.env.WORLDCOVER_BASE_URL ?? "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map";
const MAX_TILES = 6;
const MAX_PIXELS = 250_000;
const MAX_FILES = 4;

export interface WorldCoverCounts {
  /** Pixel count per WorldCover class value (10 = tree … 100 = moss). No-data pixels are left out. */
  counts: Record<string, number>;
  pixels: number;
  resolutionM: number;
  smallerThanPixel: boolean;
  urls: string[];
}

/** File covering the 3° × 3° cell whose lower-left corner is (lat3, lon3). */
export function worldCoverUrl(lat3: number, lon3: number) {
  const ns = `${lat3 < 0 ? "S" : "N"}${String(Math.abs(lat3)).padStart(2, "0")}`;
  const ew = `${lon3 < 0 ? "W" : "E"}${String(Math.abs(lon3)).padStart(3, "0")}`;
  return `${BASE}/ESA_WorldCover_10m_2021_v200_${ns}${ew}_Map.tif`;
}

async function fetchRange(url: string, start: number, length: number): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WorldCover responded ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Header of one WorldCover file, or null where none exists (open sea). The data set is static. */
async function cogHeader(url: string): Promise<CogHeader | null> {
  "use cache";
  cacheLife("max");
  let size = 64 * 1024;
  for (;;) {
    const buf = await fetchRange(url, 0, size);
    if (!buf) return null;
    try {
      return parseCogHeader(buf);
    } catch (err) {
      if (err instanceof CogHeaderTruncatedError && size < 4 * 1024 * 1024) {
        size = Math.max(err.needBytes, size * 4);
        continue;
      }
      throw err;
    }
  }
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

/** Counts WorldCover classes inside the polygon. Returns null when no valid pixel exists there. */
export async function sampleWorldCover(ring: Array<[number, number]>): Promise<WorldCoverCounts | null> {
  "use cache";
  cacheLife("weeks");

  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];

  const cells: Array<{ lat3: number; lon3: number; url: string }> = [];
  for (let lat3 = Math.floor(south / 3) * 3; lat3 <= Math.floor(north / 3) * 3; lat3 += 3) {
    for (let lon3 = Math.floor(west / 3) * 3; lon3 <= Math.floor(east / 3) * 3; lon3 += 3) cells.push({ lat3, lon3, url: worldCoverUrl(lat3, lon3) });
  }
  if (cells.length > MAX_FILES) throw new Error("Field too large to check land cover");
  const headers = new Map<string, CogHeader | null>(await Promise.all(cells.map(async (c) => [c.url, await cogHeader(c.url)] as const)));
  const known = [...headers.values()].filter((h): h is CogHeader => h !== null);
  if (!known.length) return null;

  // Full resolution unless the field needs too many tiles or pixels; then use an overview.
  const base = known[0];
  const levels = Math.min(...known.map((h) => h.levels.length));
  const resAt = (l: number) => base.pixelSize[0] * (base.levels[0].width / base.levels[l].width);
  let level = 0;
  for (; level < levels - 1; level++) {
    const res = resAt(level);
    const tile = base.levels[level].tileWidth * res;
    const tiles = (Math.floor(east / tile) - Math.floor(west / tile) + 1) * (Math.floor(north / tile) - Math.floor(south / tile) + 1);
    const pixels = ((east - west) / res + 1) * ((north - south) / res + 1);
    if (tiles <= MAX_TILES && pixels <= MAX_PIXELS) break;
  }
  const res = resAt(level);

  // Pixel centres on the global grid (WorldCover files share one grid aligned to whole degrees).
  const samples: Array<{ lon: number; lat: number }> = [];
  const gx0 = Math.floor((west + 180) / res), gx1 = Math.floor((east + 180) / res);
  const gy0 = Math.floor((90 - north) / res), gy1 = Math.floor((90 - south) / res);
  for (let gy = gy0; gy <= gy1; gy++) {
    const lat = 90 - (gy + 0.5) * res;
    for (let gx = gx0; gx <= gx1; gx++) {
      const lon = -180 + (gx + 0.5) * res;
      if (inRing(lon, lat, ring)) samples.push({ lon, lat });
    }
  }
  let smallerThanPixel = false;
  if (samples.length === 0) {
    samples.push({ lon: lons.reduce((a, b) => a + b, 0) / lons.length, lat: lats.reduce((a, b) => a + b, 0) / lats.length });
    smallerThanPixel = true;
  }

  // Locate each sample in its file and tile.
  const located = samples.map(({ lon, lat }) => {
    const url = worldCoverUrl(Math.floor(lat / 3) * 3, Math.floor(lon / 3) * 3);
    const h = headers.get(url);
    if (!h) return null;
    const lvl = h.levels[level];
    const col = Math.floor((lon - h.origin[0]) / res);
    const row = Math.floor((h.origin[1] - lat) / res);
    if (col < 0 || row < 0 || col >= lvl.width || row >= lvl.height) return null;
    const tx = Math.floor(col / lvl.tileWidth), ty = Math.floor(row / lvl.tileHeight);
    return { url, lvl, key: `${url}#${tx},${ty}`, tx, ty, x: col % lvl.tileWidth, y: row % lvl.tileHeight };
  });

  const wanted = new Map<string, { url: string; lvl: CogHeader["levels"][number]; tx: number; ty: number }>();
  for (const s of located) if (s && !wanted.has(s.key)) wanted.set(s.key, s);
  if (wanted.size > MAX_TILES * MAX_FILES) throw new Error("Field too large to check land cover");

  const tiles = new Map<string, Uint8Array | null>();
  await Promise.all(
    [...wanted.entries()].map(async ([key, t]) => {
      const range = tileRange(t.lvl, t.tx, t.ty);
      const bytes = range ? await fetchRange(t.url, range.offset, range.length) : null;
      tiles.set(key, bytes ? decodeTile(t.lvl, bytes) : null);
    }),
  );

  const counts: Record<string, number> = {};
  let pixels = 0;
  for (const s of located) {
    if (!s) continue;
    const tile = tiles.get(s.key);
    if (!tile) continue;
    const v = tile[s.y * s.lvl.tileWidth + s.x];
    const noData = headers.get(s.url)?.noData ?? 0;
    if (v === noData || v === 0) continue;
    counts[v] = (counts[v] ?? 0) + 1;
    pixels++;
  }
  if (pixels === 0) return null;

  return {
    counts,
    pixels,
    // Nominal product resolution (10 m), doubled per overview level.
    resolutionM: Math.round(10 * (base.levels[0].width / base.levels[level].width)),
    smallerThanPixel,
    urls: [...new Set(located.filter((s) => s).map((s) => s!.url))],
  };
}
