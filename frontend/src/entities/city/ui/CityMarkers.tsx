"use client";

import type { Label, LabelCollection, PointPrimitiveCollection } from "cesium";
import { useEffect, useRef } from "react";
import { useMap } from "@/entities/map";
import type { City, CityPickId } from "../model/types";

interface Props {
  cities: City[];
  selectedId?: string | null;
  hoveredId?: string | null;
  /** How many of the most populous cities may get a label (overlapping ones are hidden). */
  labelTop?: number;
}

const LIME = "#C5E58A";

/**
 * City dots (+ labels for the biggest ones, the hovered and the selected city) as Cesium
 * primitives: one draw call for hundreds of cities. Labels are decluttered in screen space
 * (selected > hovered > bigger city) whenever the camera moves. Each point carries a CityPickId so
 * `scene.pick` can resolve clicks. Renders nothing in React.
 */
export function CityMarkers({ cities, selectedId = null, hoveredId = null, labelTop = 24 }: Props) {
  const map = useMap();
  const layers = useRef<{ points: PointPrimitiveCollection; labels: LabelCollection } | null>(null);

  useEffect(() => {
    if (!map || cities.length === 0) return;
    const { Cesium, viewer } = map;
    const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection()) as PointPrimitiveCollection;
    const labels = viewer.scene.primitives.add(new Cesium.LabelCollection()) as LabelCollection;
    layers.current = { points, labels };
    return () => {
      layers.current = null;
      if (viewer.isDestroyed()) return;
      viewer.scene.primitives.remove(points);
      viewer.scene.primitives.remove(labels);
      viewer.scene.requestRender();
    };
  }, [map, cities]);

  useEffect(() => {
    const l = layers.current;
    if (!map || !l) return;
    const { Cesium, viewer } = map;
    l.points.removeAll();
    l.labels.removeAll();
    const lime = Cesium.Color.fromCssColorString(LIME);
    const white = Cesium.Color.WHITE;
    const near = new Cesium.NearFarScalar(2e5, 1, 6e6, 0.55);
    const fade = new Cesium.NearFarScalar(4e6, 1, 1.2e7, 0);
    const maxPop = Math.max(1, ...cities.map((c) => c.population));
    const ranked: Array<{ label: Label; priority: number; width: number }> = [];

    cities.forEach((c, i) => {
      const selected = c.id === selectedId;
      const hovered = c.id === hoveredId;
      const position = Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0);
      const id: CityPickId = { kind: "city", cityId: c.id };
      const base = 4 + 5 * Math.sqrt(c.population / maxPop);
      l.points.add({
        id,
        position,
        pixelSize: selected ? 13 : hovered ? base + 3 : base,
        color: selected ? lime : c.kind === "capital" ? white : white.withAlpha(0.85),
        outlineColor: selected ? Cesium.Color.fromCssColorString("#10251E") : Cesium.Color.BLACK.withAlpha(0.55),
        outlineWidth: selected ? 3 : 1.5,
        scaleByDistance: near,
        translucencyByDistance: fade,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      if (selected || hovered || i < labelTop) {
        const label = l.labels.add({
          id,
          position,
          text: c.name,
          font: `${selected ? 600 : 500} ${selected ? 14 : 12}px ui-sans-serif, system-ui, sans-serif`,
          fillColor: selected ? lime : white,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          translucencyByDistance: fade,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        ranked.push({ label, priority: selected ? -2 : hovered ? -1 : i, width: c.name.length * (selected ? 8 : 7) + 8 });
      }
    });
    ranked.sort((a, b) => a.priority - b.priority);

    // Greedy declutter: keep a label only if its box doesn't overlap a more important one.
    const scratch = new Cesium.Cartesian2();
    const declutter = () => {
      const placed: Array<[number, number, number, number]> = [];
      let changed = false;
      for (const { label, width } of ranked) {
        const p = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, label.position, scratch);
        let show = false;
        if (p) {
          const box: [number, number, number, number] = [p.x - width / 2, p.y - 30, p.x + width / 2, p.y - 12];
          show = !placed.some(([x0, y0, x1, y1]) => box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0);
          if (show) placed.push(box);
        }
        if (label.show !== show) {
          label.show = show;
          changed = true;
        }
      }
      if (changed) viewer.scene.requestRender();
    };
    declutter();
    const offChanged = viewer.camera.changed.addEventListener(declutter);
    const offMoveEnd = viewer.camera.moveEnd.addEventListener(declutter);
    viewer.scene.requestRender();
    return () => {
      offChanged();
      offMoveEnd();
    };
  }, [map, cities, selectedId, hoveredId, labelTop]);

  return null;
}
