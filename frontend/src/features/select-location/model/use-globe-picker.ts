"use client";

import type { Cartesian2 } from "cesium";
import { useEffect, useRef } from "react";
import { isCityPickId } from "@/entities/city";
import { countryAt } from "@/entities/country";
import { useMap } from "@/entities/map";

/** What is under the pointer on the globe. */
export type GlobeHit =
  | { kind: "city"; cityId: string }
  | { kind: "country"; iso3: string; lon: number; lat: number }
  | { kind: "sea"; lon: number; lat: number }
  | { kind: "space" };

interface Options {
  enabled: boolean;
  onPick: (hit: GlobeHit) => void;
  onHover?: (hit: GlobeHit) => void;
  /** Called when the country lookup itself fails (e.g. /geo/index.json unreachable). */
  onError?: (error: Error) => void;
}

function hitKey(h: GlobeHit): string {
  return h.kind === "city" ? `city:${h.cityId}` : h.kind === "country" ? `country:${h.iso3}` : h.kind;
}

/**
 * Click (and hover) picking on the shared globe: city markers first, then the country
 * under the point (real borders, see entities/country countryAt). Cesium only fires
 * LEFT_CLICK when the pointer barely moved, so dragging the globe never selects.
 * Hover is throttled to one lookup per animation frame and reported only when it changes.
 */
export function useGlobePicker({ enabled, onPick, onHover, onError }: Options) {
  const map = useMap();
  const handlers = useRef({ onPick, onHover, onError });
  useEffect(() => {
    handlers.current = { onPick, onHover, onError };
  });

  useEffect(() => {
    if (!map || !enabled) return;
    const { Cesium, viewer } = map;
    const { scene, camera, canvas } = viewer;
    const handler = new Cesium.ScreenSpaceEventHandler(canvas);
    let disposed = false;
    let hoverToken = 0;
    let lastHoverKey = "";
    let raf = 0;
    let pendingMove: Cartesian2 | null = null;

    const resolve = async (pos: Cartesian2): Promise<GlobeHit> => {
      const picked = scene.pick(pos) as { id?: unknown } | undefined;
      if (picked && isCityPickId(picked.id)) return { kind: "city", cityId: picked.id.cityId };
      const ground = camera.pickEllipsoid(pos, scene.globe.ellipsoid);
      if (!ground) return { kind: "space" };
      const c = Cesium.Cartographic.fromCartesian(ground);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const lat = Cesium.Math.toDegrees(c.latitude);
      const iso3 = await countryAt(lon, lat);
      return iso3 ? { kind: "country", iso3, lon, lat } : { kind: "sea", lon, lat };
    };

    const setCursor = (h: GlobeHit) => {
      canvas.style.cursor = h.kind === "city" || h.kind === "country" ? "pointer" : "";
    };

    handler.setInputAction((e: { position: Cartesian2 }) => {
      resolve(Cesium.Cartesian2.clone(e.position))
        .then((hit) => !disposed && handlers.current.onPick(hit))
        .catch((err: unknown) => !disposed && handlers.current.onError?.(err instanceof Error ? err : new Error(String(err))));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    const flushHover = () => {
      raf = 0;
      if (!pendingMove || disposed) return;
      const pos = pendingMove;
      pendingMove = null;
      const token = ++hoverToken;
      resolve(pos)
        .then((hit) => {
          if (disposed || token !== hoverToken) return;
          setCursor(hit);
          const key = hitKey(hit);
          if (key === lastHoverKey) return;
          lastHoverKey = key;
          handlers.current.onHover?.(hit);
        })
        .catch(() => undefined); // hover is best-effort; clicks report errors
    };

    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      pendingMove = Cesium.Cartesian2.clone(e.endPosition);
      if (!raf) raf = requestAnimationFrame(flushHover);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const onLeave = () => {
      hoverToken++;
      pendingMove = null;
      if (lastHoverKey !== "space") {
        lastHoverKey = "space";
        handlers.current.onHover?.({ kind: "space" });
      }
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerleave", onLeave);
      if (!handler.isDestroyed()) handler.destroy();
      if (!viewer.isDestroyed()) canvas.style.cursor = "";
    };
  }, [map, enabled]);
}
