import type { LatestImageAnswer } from "@/entities/satellite-layer/model/latest-image";
import { findLatestClearImage } from "@/shared/api/nasa/hls-latest";

const SEARCH_DAYS = 60;

/**
 * GET /api/latest-image?west=&south=&east=&north=[&before=YYYY-MM-DD]
 * Newest cloud-free NASA HLS (Sentinel-2 / Landsat, 30 m) image of the field, searching up to
 * 60 days back from `before` (default: tomorrow, i.e. including today). Answers { image, searchedDays }.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const [west, south, east, north] = ["west", "south", "east", "north"].map((k) => Number(q.get(k)));
  const ok =
    [west, south, east, north].every(Number.isFinite) &&
    Math.abs(west) <= 180 && Math.abs(east) <= 180 && Math.abs(south) <= 85 && Math.abs(north) <= 85 &&
    west < east && south < north && east - west < 0.5 && north - south < 0.5;
  if (!ok) return Response.json({ error: "Send west, south, east, north of the field (a box smaller than 0.5°)." }, { status: 400 });

  const beforeParam = q.get("before");
  const before = beforeParam && /^\d{4}-\d{2}-\d{2}$/.test(beforeParam) ? new Date(`${beforeParam}T00:00:00Z`) : new Date(Date.now() + 86_400_000);
  if (Number.isNaN(before.getTime())) return Response.json({ error: "`before` must be YYYY-MM-DD." }, { status: 400 });

  try {
    const image = await findLatestClearImage({ west, south, east, north }, before, SEARCH_DAYS);
    const body: LatestImageAnswer = { image, searchedDays: SEARCH_DAYS };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=10800" } });
  } catch (err) {
    console.error("[api/latest-image]", err);
    return Response.json({ error: "The latest NASA image could not be found. Please try again." }, { status: 500 });
  }
}
