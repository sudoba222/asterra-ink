import type { LonLat } from "../model/types";

/** Planar area-weighted centroid (fine at field scale). Falls back to vertex mean. */
export function ringCentroid(ring: LonLat[]): { lat: number; lon: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return { lat, lon };
  }
  return { lon: cx / (3 * a), lat: cy / (3 * a) };
}

export function ringBBox(ring: LonLat[]) {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
}

/** GeoJSON Feature for export / future backend. Closes the ring as GeoJSON requires. */
export function toGeoJsonFeature(ring: LonLat[], properties: Record<string, unknown>) {
  return {
    type: "Feature" as const,
    properties,
    geometry: { type: "Polygon" as const, coordinates: [[...ring, ring[0]]] },
  };
}
