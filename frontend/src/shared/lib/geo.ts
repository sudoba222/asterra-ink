/** Minimal GeoJSON helpers for country polygons (lon/lat order, WGS84). */
export type Position = [number, number];
export type Ring = Position[];
export type PolygonCoords = Ring[];

export interface CountryGeometry {
  polygons: PolygonCoords[]; // every polygon (outer ring + holes)
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ geometry: { type: string; coordinates: unknown } | null }>;
}

export function geometryFromGeoJson(fc: GeoJsonFeatureCollection): CountryGeometry {
  const polygons: PolygonCoords[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === "Polygon") polygons.push(f.geometry.coordinates as PolygonCoords);
    if (f.geometry.type === "MultiPolygon") polygons.push(...(f.geometry.coordinates as PolygonCoords[]));
  }
  return { polygons };
}

/**
 * Bounding box that handles the antimeridian: if the plain box is wider than the
 * box computed in 0–360° space, the latter is used (west > east then means it
 * crosses 180°, which Cesium's Rectangle understands).
 */
export function bboxOf(geom: CountryGeometry): BBox | null {
  let south = 90, north = -90;
  let w1 = 180, e1 = -180, w2 = 360, e2 = 0;
  let any = false;
  for (const poly of geom.polygons) {
    for (const [lon, lat] of poly[0] ?? []) {
      any = true;
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      w1 = Math.min(w1, lon);
      e1 = Math.max(e1, lon);
      const l360 = lon < 0 ? lon + 360 : lon;
      w2 = Math.min(w2, l360);
      e2 = Math.max(e2, l360);
    }
  }
  if (!any) return null;
  if (e2 - w2 < e1 - w1 - 1) {
    const norm = (l: number) => (l > 180 ? l - 360 : l);
    return { west: norm(w2), east: norm(e2), south, north };
  }
  return { west: w1, east: e1, south, north };
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(lon: number, lat: number, geom: CountryGeometry): boolean {
  return geom.polygons.some((poly) => {
    if (!poly[0] || !pointInRing(lon, lat, poly[0])) return false;
    return !poly.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

/* ---------- simplification (radial distance) ---------- */

/** Drops vertices closer than `tolerance` degrees to the previous kept vertex. Keeps rings closed. */
export function simplifyRing(ring: Ring, tolerance: number, precision = 1e4): Ring {
  const round = ([x, y]: Position): Position => [Math.round(x * precision) / precision, Math.round(y * precision) / precision];
  if (ring.length <= 8) return ring.map(round);
  const out: Ring = [round(ring[0])];
  let [px, py] = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i];
    if (Math.abs(x - px) > tolerance || Math.abs(y - py) > tolerance) {
      out.push(round(ring[i]));
      px = x;
      py = y;
    }
  }
  out.push(round(ring[ring.length - 1]));
  return out.length >= 4 ? out : ring.map(round);
}

export function simplifyGeometry(geom: CountryGeometry, tolerance: number): CountryGeometry {
  return { polygons: geom.polygons.map((poly) => poly.map((ring) => simplifyRing(ring, tolerance))) };
}

/** Area-weighted centroid of the largest polygon's outer ring (planar, fine for admin areas). */
export function geometryCentroid(geom: CountryGeometry): Position | null {
  let best: { a: number; c: Position } | null = null;
  for (const poly of geom.polygons) {
    const ring = poly[0];
    if (!ring || ring.length < 4) continue;
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[i];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (a === 0) continue;
    const c: Position = [cx / (3 * a), cy / (3 * a)];
    if (!best || Math.abs(a) > best.a) best = { a: Math.abs(a), c };
  }
  return best?.c ?? null;
}
