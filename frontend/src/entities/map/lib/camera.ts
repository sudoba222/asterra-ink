import type { BBox } from "@/shared/lib";
import type { MapHandle } from "../model/map-context";

interface FlyOptions {
  /** Extra margin as a fraction of the span. */
  pad?: number;
  /** Minimum span in degrees (so tiny areas don't zoom to roof level). */
  minSpanDeg?: number;
  duration?: number;
  /** Screen space covered by floating panels, so the area is framed in the visible part. */
  inset?: { left?: number; bottom?: number };
}

/** Panel insets used by the finder/home views (desktop side panel, mobile bottom sheet). */
export function panelInset(): { left?: number; bottom?: number } {
  if (typeof window === "undefined") return {};
  return window.innerWidth >= 640 ? { left: 420 } : { bottom: Math.round(window.innerHeight * 0.52) };
}

/** Smooth flight that frames a bounding box (handles boxes crossing the antimeridian). */
export function flyToBBox({ Cesium, viewer }: MapHandle, b: BBox, { pad = 0.15, minSpanDeg = 0.05, duration = 2.2, inset }: FlyOptions = {}) {
  let { west, east, south, north } = b;
  const width = east >= west ? east - west : east + 360 - west;
  const height = north - south;
  const span = Math.max(width, height, minSpanDeg);
  const padX = (span - width) / 2 + span * pad;
  const padY = (span - height) / 2 + span * pad;
  west -= padX;
  east += padX;
  south = Math.max(-89, south - padY);
  north = Math.min(89, north + padY);
  // Grow the box toward the panel so the area lands in the uncovered part of the map.
  const cw = viewer.canvas.clientWidth || 1;
  const ch = viewer.canvas.clientHeight || 1;
  if (inset?.left && inset.left < cw * 0.7) {
    const f = inset.left / cw;
    west -= ((east - west) * f) / (1 - f);
  }
  if (inset?.bottom && inset.bottom < ch * 0.7) {
    const f = inset.bottom / ch;
    south = Math.max(-89, south - ((north - south) * f) / (1 - f));
  }
  const wrap = (l: number) => (l < -180 ? l + 360 : l > 180 ? l - 360 : l);
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(wrap(west), south, wrap(east), north),
    duration,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

export function flyToPoint({ Cesium, viewer }: MapHandle, lat: number, lon: number, heightM: number, duration = 2.4) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
    duration,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

export const OVERVIEW_VIEW = { lon: 30, lat: 18, height: 21_000_000 };

export function flyToOverview(map: MapHandle, duration = 2) {
  flyToPoint(map, OVERVIEW_VIEW.lat, OVERVIEW_VIEW.lon, OVERVIEW_VIEW.height, duration);
}

/** Camera altitude above the ellipsoid, metres. */
export function cameraHeight({ viewer }: MapHandle): number {
  return viewer.camera.positionCartographic.height;
}
