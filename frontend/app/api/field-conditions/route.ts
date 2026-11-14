import type { LonLat } from "@/entities/field";
import { getFieldConditions } from "@/entities/field-conditions/server";

/**
 * POST /api/field-conditions  { polygon: [[lon, lat], ...] }
 * Real data only: NASA POWER daily, NASA GIBS MODIS NDVI sampled inside the polygon,
 * Open-Meteo 3-day forecast. Missing sources are reported, never invented.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { polygon?: unknown } | null;
  const ring = body?.polygon;
  const valid =
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.length <= 500 &&
    ring.every(
      (p) => Array.isArray(p) && p.length === 2 && Math.abs(Number(p[0])) <= 180 && Math.abs(Number(p[1])) <= 90 && p.every((n) => Number.isFinite(Number(n))),
    );
  if (!valid) return Response.json({ error: "Send { polygon: [[lon, lat], …] } with 3–500 points." }, { status: 400 });

  try {
    const conditions = await getFieldConditions((ring as unknown[][]).map((p) => [Number(p[0]), Number(p[1])] as LonLat));
    return Response.json(conditions, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (err) {
    console.error("[api/field-conditions]", err);
    return Response.json({ error: "Field data could not be prepared. Please try again." }, { status: 500 });
  }
}
