import type { LonLat } from "../model/types";

/** Mean Earth radius (IUGG), as used by turf.js v7 `area` — best single radius for a spherical model. */
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Geodesic area of a simple polygon on the sphere, in m².
 * Algorithm: Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere" (JPL, 2007),
 * as used by turf.js `area`. Accurate to well under 1 % for field-sized polygons.
 */
export function ringAreaM2(ring: LonLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

export function areaHectares(ring: LonLat[]): number {
  return ringAreaM2(ring) / 10_000;
}

export function formatHectares(ha: number): string {
  if (ha < 1) return `${ha.toFixed(2)} ha`;
  if (ha < 100) return `${ha.toFixed(1)} ha`;
  return `${Math.round(ha).toLocaleString("en-US")} ha`;
}
