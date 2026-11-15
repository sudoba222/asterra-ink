import "server-only";
import { HLS_MAX_LEVEL, HLS_PRODUCTS, hlsTileUrl, type BBox, type HlsProduct, type LatestImage } from "@/entities/satellite-layer/model/latest-image";
import { decodeRgbaPng } from "@/shared/lib/rgba-png";
import { boxWindow, clearShare, type TileWindow } from "@/shared/lib/tile-window";

/** Measured on HLS true-colour tiles over farmland: clear land has min(R,G,B) ≤ ~150, cloud ≥ ~200. */
const CLOUD_MIN_RGB = 160;
const MIN_CLEAR_SHARE = 0.9;
const PARALLEL_DAYS = 6;

async function score(product: HlsProduct, date: string, w: TileWindow): Promise<number> {
  const url = hlsTileUrl(product, date).replace("{z}", String(w.zoom)).replace("{y}", String(w.tileY)).replace("{x}", String(w.tileX));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), next: { revalidate: 86_400 } });
    if (!res.ok) return 0; // 404/500 = no granule that day
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 1_000) return 0; // fully transparent tile: no satellite pass here
    const img = decodeRgbaPng(buf);
    return img ? clearShare(img, w, CLOUD_MIN_RGB) : 0;
  } catch {
    return 0;
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Newest day before `before` (searching `days` back) with a clear HLS view of the field.
 * Checks Sentinel-2 and Landsat for each day, newest first, a few days in parallel.
 */
export async function findLatestClearImage(b: BBox, before: Date, days: number): Promise<LatestImage | null> {
  const w = boxWindow(b, HLS_MAX_LEVEL);
  for (let start = 1; start <= days; start += PARALLEL_DAYS) {
    const batch = Array.from({ length: Math.min(PARALLEL_DAYS, days - start + 1) }, (_, i) => isoDay(new Date(before.getTime() - (start + i) * 86_400_000)));
    const results = await Promise.all(
      batch.flatMap((date) => (Object.keys(HLS_PRODUCTS) as HlsProduct[]).map(async (product) => ({ date, product, share: await score(product, date, w) }))),
    );
    const hit = results.find((r) => r.share >= MIN_CLEAR_SHARE); // newest first, Sentinel-2 before Landsat
    if (hit) return { date: hit.date, product: hit.product, satellite: HLS_PRODUCTS[hit.product].satellite, clearShare: Math.round(hit.share * 100) / 100 };
  }
  return null;
}
