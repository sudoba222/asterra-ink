import type { NextRequest } from "next/server";
import { getCountries } from "@/entities/country/server";
import { getCountryCities, nearestCity, searchCities } from "@/shared/api/geonames-cities";

/**
 * GET /api/cities?iso=UZB                    → most populous cities/towns of the country
 * GET /api/cities?iso=UZB&q=chirch           → towns matching a name
 * GET /api/cities?iso=UZB&lat=41.3&lon=69.0  → { city } nearest to a point (or null)
 * Data: GeoNames (CC BY 4.0) via OpenDataSoft. See docs/DATA_SOURCES.md.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const iso3 = (sp.get("iso") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) return Response.json({ error: "Provide a 3-letter ISO country code." }, { status: 400 });
  const iso2 = getCountries().find((c) => c.iso3 === iso3)?.iso2?.toUpperCase();
  if (!iso2) return Response.json({ error: "Unknown country." }, { status: 400 });

  const q = sp.get("q")?.trim();
  const lat = sp.get("lat");
  const lon = sp.get("lon");
  const cache = { "Cache-Control": "public, max-age=86400" };

  try {
    if (lat !== null && lon !== null) {
      const la = Number(lat);
      const lo = Number(lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        return Response.json({ error: "lat/lon out of range." }, { status: 400 });
      }
      // Round so nearby clicks share a cache entry (≈1 km).
      return Response.json({ city: await nearestCity(iso2, Math.round(la * 100) / 100, Math.round(lo * 100) / 100) }, { headers: cache });
    }
    if (q) {
      if (q.length < 2) return Response.json({ error: "Type at least 2 letters." }, { status: 400 });
      return Response.json(await searchCities(iso2, q), { headers: cache });
    }
    return Response.json(await getCountryCities(iso2), { headers: cache });
  } catch (err) {
    console.error("[api/cities]", err);
    return Response.json({ error: "City data could not be loaded. Please try again." }, { status: 502 });
  }
}
