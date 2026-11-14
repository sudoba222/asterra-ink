import "server-only";
import { cacheLife } from "next/cache";
import { bboxOf, geometryCentroid, geometryFromGeoJson, simplifyGeometry, type BBox, type CountryGeometry, type Position } from "@/shared/lib";

/**
 * geoBoundaries (William & Mary geoLab) administrative boundaries, gbOpen release.
 * https://www.geoboundaries.org/api.html — licence varies by country (ODbL / CC BY);
 * the per-country licence is returned with every result.
 * Files can be very large (Brazil ADM2 ≈ 41 MB), so they are downloaded and simplified
 * on the server once and cached; the client only receives the slim result.
 */
export interface AdminArea {
  id: string;
  name: string;
  bbox: BBox;
  centroid: Position | null;
  geometry: CountryGeometry;
}

export interface AdminLevelResult {
  available: boolean;
  level: 1 | 2;
  areas: AdminArea[];
  license: string | null;
  source: string;
}

const API = "https://www.geoboundaries.org/api/current/gbOpen";
const TOLERANCE = { 1: 0.008, 2: 0.002 } as const;

interface GbMeta {
  simplifiedGeometryGeoJSON?: string;
  boundaryLicense?: string;
}

interface GbFeature {
  properties?: { shapeName?: string; shapeID?: string };
  geometry: { type: string; coordinates: unknown } | null;
}

export async function getAdminLevel(iso3: string, level: 1 | 2): Promise<AdminLevelResult> {
  "use cache";
  cacheLife("weeks");

  const iso = iso3.toUpperCase();
  const empty: AdminLevelResult = { available: false, level, areas: [], license: null, source: `${API}/${iso}/ADM${level}/` };

  const metaRes = await fetch(`${API}/${iso}/ADM${level}/`, { signal: AbortSignal.timeout(20_000) });
  if (!metaRes.ok) return empty;
  const meta = (await metaRes.json().catch(() => null)) as GbMeta | null;
  if (!meta?.simplifiedGeometryGeoJSON) return empty;

  const geoRes = await fetch(meta.simplifiedGeometryGeoJSON, { signal: AbortSignal.timeout(90_000), redirect: "follow" });
  if (!geoRes.ok) throw new Error(`geoBoundaries geometry responded ${geoRes.status}`);
  const fc = (await geoRes.json()) as { features?: GbFeature[] };

  const areas: AdminArea[] = [];
  for (const f of fc.features ?? []) {
    if (!f.geometry) continue;
    const geometry = simplifyGeometry(geometryFromGeoJson({ type: "FeatureCollection", features: [f] }), TOLERANCE[level]);
    const bbox = bboxOf(geometry);
    if (!bbox) continue;
    areas.push({
      id: f.properties?.shapeID ?? `${iso}-${level}-${areas.length}`,
      name: f.properties?.shapeName?.trim() || "Unnamed area",
      bbox,
      centroid: geometryCentroid(geometry),
      geometry,
    });
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));
  return { available: areas.length > 0, level, areas, license: meta.boundaryLicense ?? null, source: empty.source };
}
