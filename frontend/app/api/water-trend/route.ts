import type { NextRequest } from "next/server";
import type { WaterTrendInfo } from "@/entities/crop";
import { AsterraApiError, getAsterraApi } from "@/shared/api/asterra-api";

/**
 * GET /api/water-trend?lat=37.84&lon=68.77
 * Regional trend of water stored on and under the land (NASA/JPL GRACE & GRACE-FO, ≈300 km), from the
 * ASTERRA backend, which holds the NASA Earthdata token. Answers `WaterTrendInfo`.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 89.75 || Math.abs(lon) > 180) {
    return Response.json({ error: "Provide valid lat (−89.75…89.75) and lon (−180…180)." }, { status: 400 });
  }
  try {
    const q = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3) });
    const result = await getAsterraApi<WaterTrendInfo>(`/water/trend?${q}`, 330_000);
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    if (err instanceof AsterraApiError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[api/water-trend]", err);
    return Response.json({ error: "The water trend could not be loaded. Please try again." }, { status: 500 });
  }
}
