import type { LonLat } from "@/entities/field";
import { fetchNdviHistory } from "@/entities/ndvi-history/server";
import { AsterraApiError } from "@/shared/api/asterra-api";

/**
 * POST /api/field-ndvi  { polygon: [[lon, lat], ...] }
 * Sentinel-2 NDVI for the last 12 months (Copernicus), fetched by the ASTERRA backend,
 * which keeps the Copernicus keys. Answers the backend's `{ source, areaHectares, intervalDays, series }`.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { polygon?: unknown } | null;
  const ring = body?.polygon;
  const valid =
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.length <= 500 &&
    ring.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(Number(n))));
  if (!valid) return Response.json({ error: "Send { polygon: [[lon, lat], …] } with 3–500 points." }, { status: 400 });

  try {
    const result = await fetchNdviHistory((ring as unknown[][]).map((p) => [Number(p[0]), Number(p[1])] as LonLat));
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    if (err instanceof AsterraApiError) {
      const headers = err.code === "COPERNICUS_BUSY" ? { "Retry-After": "120" } : undefined;
      return Response.json({ error: err.message, code: err.code }, { status: err.status, headers });
    }
    console.error("[api/field-ndvi]", err);
    return Response.json({ error: "Satellite history could not be loaded. Please try again." }, { status: 500 });
  }
}
