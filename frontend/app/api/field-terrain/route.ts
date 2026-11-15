import type { FieldTerrain } from "@/entities/crop";
import type { LonLat } from "@/entities/field";
import { AsterraApiError, postAsterraApi } from "@/shared/api/asterra-api";

/**
 * POST /api/field-terrain  { polygon: [[lon, lat], ...] }
 * Slope, height and water-erosion risk of the field from NASA NASADEM (30 m), computed by the
 * ASTERRA backend, which holds the NASA Earthdata token. Answers `FieldTerrain`.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { polygon?: unknown } | null;
  const ring = body?.polygon;
  const valid =
    Array.isArray(ring) && ring.length >= 3 && ring.length <= 500 && ring.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(Number(n))));
  if (!valid) return Response.json({ error: "Send { polygon: [[lon, lat], …] } with 3–500 points." }, { status: 400 });
  try {
    const polygon = (ring as unknown[][]).map((p) => [Number(p[0]), Number(p[1])] as LonLat);
    const result = await postAsterraApi<FieldTerrain>("/fields/terrain", { polygon }, 200_000);
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    if (err instanceof AsterraApiError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[api/field-terrain]", err);
    return Response.json({ error: "Slope data could not be loaded. Please try again." }, { status: 500 });
  }
}
