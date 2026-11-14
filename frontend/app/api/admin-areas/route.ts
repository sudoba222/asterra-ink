import type { NextRequest } from "next/server";
import { getAdminLevel } from "@/shared/api/geoboundaries";
import { pointInGeometry } from "@/shared/lib";

/**
 * GET /api/admin-areas?iso=UZB                 → regions (ADM1)
 * GET /api/admin-areas?iso=UZB&region=<id>     → districts (ADM2) inside that region
 * geoBoundaries features carry no parent id, so districts are assigned to a region
 * by testing their centroid against the region polygon.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const iso = (sp.get("iso") ?? "").toUpperCase();
  const regionId = sp.get("region");
  if (!/^[A-Z]{3}$/.test(iso)) return Response.json({ error: "Provide a 3-letter ISO country code." }, { status: 400 });

  try {
    if (!regionId) {
      const regions = await getAdminLevel(iso, 1);
      return Response.json(regions, { headers: { "Cache-Control": "public, max-age=86400" } });
    }
    const [regions, districts] = await Promise.all([getAdminLevel(iso, 1), getAdminLevel(iso, 2)]);
    const region = regions.areas.find((a) => a.id === regionId);
    if (!region) return Response.json({ error: "Unknown region." }, { status: 404 });
    const inside = districts.areas.filter((d) => {
      if (!d.centroid) return false;
      const [lon, lat] = d.centroid;
      const b = region.bbox;
      if (lat < b.south || lat > b.north) return false;
      return pointInGeometry(lon, lat, region.geometry);
    });
    return Response.json(
      { ...districts, available: inside.length > 0, areas: inside },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch (err) {
    console.error("[api/admin-areas]", err);
    return Response.json({ error: "Boundary data could not be loaded. Please try again." }, { status: 502 });
  }
}
