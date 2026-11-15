import type { NextRequest } from "next/server";
import { smapEvidence } from "@/entities/climate/lib/smap-evidence";
import { sampleSmap } from "@/shared/api/nasa/gibs-smap";

/**
 * GET /api/smap?lat=37.84&lon=68.77
 * NASA SMAP L4 root-zone soil moisture at the field (latest day and the same day a year earlier)
 * from NASA GIBS, no key: { now, lastYear, evidence }. `evidence` goes into fieldEvidence(…, extra).
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    return Response.json({ error: "Provide valid lat (−85…85) and lon (−180…180)." }, { status: 400 });
  }
  try {
    const now = await sampleSmap(lat, lon, "default");
    let lastYear = null;
    if (now?.date) {
      // Same day a year earlier; GIBS has gaps (e.g. 10 Oct–11 Dec 2025), so take the nearest day within ±5 weeks.
      const base = new Date(`${now.date}T00:00:00Z`);
      base.setUTCFullYear(base.getUTCFullYear() - 1);
      const offsets = [0, -7, 7, -14, 14, -21, 21, -28, 28, -35, 35];
      const tries = await Promise.all(
        offsets.map((o) => sampleSmap(lat, lon, new Date(base.getTime() + o * 86_400_000).toISOString().slice(0, 10)).catch(() => null)),
      );
      lastYear = tries.find((t) => t !== null) ?? null; // offsets are ordered nearest first
    }
    return Response.json({ now, lastYear, evidence: smapEvidence(now, lastYear) }, { headers: { "Cache-Control": "public, max-age=10800" } });
  } catch (err) {
    console.error("[api/smap]", err);
    return Response.json({ error: "NASA SMAP soil moisture is not available right now. Please try again." }, { status: 502 });
  }
}
