import type { NextRequest } from "next/server";
import type { PeriodId } from "@/entities/climate";
import { getEnvironmentalProfile } from "@/entities/climate/server";

/**
 * GET /api/environment?lat=41.3&lon=69.2&period=12m&kind=reference
 * Builds the common EnvironmentalProfile server-side (NASA POWER live, other
 * sources sample/not-connected). No secrets are needed or exposed.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const period = (sp.get("period") ?? "12m") as PeriodId;
  const kind = sp.get("kind") === "custom" ? "custom" : "reference";

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "Provide valid lat (−90…90) and lon (−180…180)." }, { status: 400 });
  }
  if (period !== "12m" && period !== "36m") {
    return Response.json({ error: "period must be 12m or 36m." }, { status: 400 });
  }

  try {
    const profile = await getEnvironmentalProfile({ lat, lon, kind }, period);
    return Response.json(profile, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    console.error("[api/environment]", err);
    return Response.json({ error: "Could not build the environmental profile." }, { status: 500 });
  }
}
