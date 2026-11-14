import type { LonLat } from "../model/types";
import { areaHectares } from "./area";

export type FieldProblem = "too-few-points" | "self-intersecting" | "too-small" | "too-large";

export const MIN_FIELD_HA = 0.01;
export const MAX_FIELD_HA = 100_000;

function orient(a: LonLat, b: LonLat, c: LonLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(p1: LonLat, p2: LonLat, p3: LonLat, p4: LonLat): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True if any two non-adjacent edges of the closed ring cross. */
export function isSelfIntersecting(ring: LonLat[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      if (segmentsCross(a1, a2, ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function validateField(ring: LonLat[]): FieldProblem | null {
  if (ring.length < 3) return "too-few-points";
  if (isSelfIntersecting(ring)) return "self-intersecting";
  const ha = areaHectares(ring);
  if (ha < MIN_FIELD_HA) return "too-small";
  if (ha > MAX_FIELD_HA) return "too-large";
  return null;
}

export const PROBLEM_TEXT: Record<FieldProblem, string> = {
  "too-few-points": "Mark at least 3 corners.",
  "self-intersecting": "The edges cross each other. Drag a corner to untangle the shape.",
  "too-small": "This shape is very small. Zoom in and mark the corners of the whole field.",
  "too-large": "This shape is larger than 100,000 ha. Please mark a single field.",
};
