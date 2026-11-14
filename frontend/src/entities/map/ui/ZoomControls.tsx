"use client";

import { Minus, Plus } from "lucide-react";
import { useMap } from "../model/map-context";

/** Simple +/− buttons: easier than scroll or pinch for many farmers. */
export function ZoomControls({ className }: { className?: string }) {
  const map = useMap();
  const zoom = (dir: 1 | -1) => {
    if (!map) return;
    const { Cesium, viewer } = map;
    const h = viewer.camera.positionCartographic.height;
    const target = Cesium.Math.clamp(dir === 1 ? h * 0.45 : h * 2.2, 200, 30_000_000);
    const c = viewer.camera.positionCartographic;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, target),
      orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
      duration: 0.6,
    });
  };
  if (!map) return null;
  return (
    <div className={className} role="group" aria-label="Zoom">
      <div className="glass flex flex-col overflow-hidden rounded-xl shadow-[var(--shadow-float)]">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in" className="grid size-10 place-items-center text-white transition hover:bg-white/10">
          <Plus className="size-4" aria-hidden />
        </button>
        <span className="h-px bg-white/10" aria-hidden />
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out" className="grid size-10 place-items-center text-white transition hover:bg-white/10">
          <Minus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
