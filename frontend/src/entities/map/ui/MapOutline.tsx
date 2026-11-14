"use client";

import type { Entity } from "cesium";
import { useEffect } from "react";
import type { CountryGeometry } from "@/shared/lib";
import { useMap } from "../model/map-context";

interface Props {
  geometry: CountryGeometry | null;
  color?: string;
  fillAlpha?: number;
  width?: number;
}

/** Draws a (multi)polygon outline on the globe while mounted. Renders nothing in React. */
export function MapOutline({ geometry, color = "#C5E58A", fillAlpha = 0.1, width = 2 }: Props) {
  const map = useMap();
  useEffect(() => {
    if (!map || !geometry) return;
    const { Cesium, viewer } = map;
    const c = Cesium.Color.fromCssColorString(color);
    const added: Entity[] = [];
    const toPositions = (ring: number[][]) => Cesium.Cartesian3.fromDegreesArray(ring.flat());
    for (const poly of geometry.polygons) {
      const outer = poly[0];
      if (!outer || outer.length < 4) continue;
      if (fillAlpha > 0) {
        added.push(
          viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(
                toPositions(outer),
                poly.slice(1).map((h) => new Cesium.PolygonHierarchy(toPositions(h))),
              ),
              material: c.withAlpha(fillAlpha),
              height: 0,
            },
          }),
        );
      }
      added.push(viewer.entities.add({ polyline: { positions: toPositions(outer), width, material: c, clampToGround: false } }));
    }
    viewer.scene.requestRender();
    return () => {
      if (viewer.isDestroyed()) return;
      for (const e of added) viewer.entities.remove(e);
      viewer.scene.requestRender();
    };
  }, [map, geometry, color, fillAlpha, width]);
  return null;
}
