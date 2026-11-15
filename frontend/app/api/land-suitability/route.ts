import type { LonLat } from "@/entities/field";
import { validateLand } from "@/entities/land-suitability/server";

/**
 * POST /api/land-suitability  { polygon: [[lon, lat], ...] }
 * Checks whether the polygon is farmable land BEFORE any crop recommendation is made:
 *   { status: "suitable" | "unsuitable_land" | "uncertain", reason, message, evidence, warnings, sources, … }
 * Based on ESA WorldCover 10 m land cover and OpenStreetMap geometry inside the polygon —
 * never on climate. Missing or conflicting data gives "uncertain", not "unsuitable_land".
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
    const result = await validateLand((ring as unknown[][]).map((p) => [Number(p[0]), Number(p[1])] as LonLat));
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (err) {
    console.error("[api/land-suitability]", err);
    return Response.json({ error: "The land check could not be completed. Please try again." }, { status: 500 });
  }
}
