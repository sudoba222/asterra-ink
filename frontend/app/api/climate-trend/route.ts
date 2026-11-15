import type { NextRequest } from "next/server";
import { climateTrend } from "@/entities/climate/lib/climate-trend";
import { fetchPowerMonthly } from "@/shared/api/nasa/power";

const FIRST_YEAR = 2005;

/**
 * GET /api/climate-trend?lat=37.84&lon=68.77
 * 20-year climate change at the point from NASA POWER monthly data (no key):
 * { years, meanTemp, summerTemp, annualRain, frostMonths, sentence, evidence }.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "Provide valid lat (−90…90) and lon (−180…180)." }, { status: 400 });
  }
  const lastFullYear = new Date().getUTCFullYear() - 1;
  try {
    const power = await fetchPowerMonthly(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, FIRST_YEAR, lastFullYear);
    const p = power.parameters;
    return Response.json(climateTrend(p.T2M, p.T2M_MIN, p.PRECTOTCORR, FIRST_YEAR, lastFullYear), {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    console.error("[api/climate-trend]", err);
    return Response.json({ error: "NASA POWER long-term data is not available right now. Please try again." }, { status: 502 });
  }
}
