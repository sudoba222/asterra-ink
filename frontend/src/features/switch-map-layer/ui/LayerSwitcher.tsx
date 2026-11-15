"use client";

import type { ImageryLayer } from "cesium";
import { CalendarClock, Check, Droplets, Layers, Leaf, Satellite } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  getSatelliteLayer,
  gibsTileUrl,
  HLS_MAX_LEVEL,
  hlsTileUrl,
  LatestImageCard,
  LayerLegend,
  useLatestImage,
  type BBox,
  type SatelliteLayerId,
} from "@/entities/satellite-layer";
import { useMap } from "@/entities/map";
import { cn } from "@/shared/lib";

type Choice = SatelliteLayerId | "latest";

const OPTIONS: Array<{ id: Choice; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "none", label: "Satellite photo", icon: Satellite },
  { id: "latest", label: "Latest image (NASA)", icon: CalendarClock },
  { id: "ndvi", label: "Crop health (NASA)", icon: Leaf },
  { id: "soilmoisture", label: "Soil moisture (NASA)", icon: Droplets },
];

/**
 * One small "Layers" button; adds a NASA GIBS overlay through the shared map.
 * With `focus` (the field's box) it also offers "Latest image": the newest cloud-free NASA HLS picture of it.
 */
export function LayerSwitcher({ className, focus }: { className?: string; focus?: BBox }) {
  const map = useMap();
  const [layer, setLayer] = useState<Choice>("none");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = layer === "latest" ? null : getSatelliteLayer(layer);
  const latest = useLatestImage(focus ?? null, layer === "latest");
  const latestImage = layer === "latest" && latest.status === "success" ? latest.image : null;
  const options = focus ? OPTIONS : OPTIONS.filter((o) => o.id !== "latest");

  useEffect(() => {
    if (!map || !latestImage) return;
    const { Cesium, viewer } = map;
    const imagery: ImageryLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: hlsTileUrl(latestImage.product, latestImage.date),
        maximumLevel: HLS_MAX_LEVEL,
        credit: new Cesium.Credit(`NASA GIBS · HLS ${latestImage.satellite} · ${latestImage.date}`),
      }),
    );
    viewer.scene.requestRender();
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.imageryLayers.remove(imagery, true);
        viewer.scene.requestRender();
      }
    };
  }, [map, latestImage]);

  useEffect(() => {
    if (!map || !active) return;
    const { Cesium, viewer } = map;
    const imagery: ImageryLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: gibsTileUrl(active),
        maximumLevel: active.maxLevel,
        credit: new Cesium.Credit(`NASA GIBS · ${active.product}`),
      }),
    );
    imagery.alpha = 0.75;
    viewer.scene.requestRender();
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.imageryLayers.remove(imagery, true);
        viewer.scene.requestRender();
      }
    };
  }, [map, active]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className={cn("flex flex-col items-end gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-white shadow-[var(--shadow-float)] transition hover:bg-[rgba(13,31,25,0.8)]"
      >
        <Layers className="size-4" aria-hidden /> {layer === "latest" ? "Latest image" : active ? active.shortLabel : "Layers"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass w-56 rounded-2xl p-1.5 shadow-[var(--shadow-float)]"
            role="menu"
          >
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={layer === o.id}
                  onClick={() => {
                    setLayer(o.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/85 hover:bg-white/8"
                >
                  <o.icon className="size-4 text-lime" />
                  <span className="flex-1">{o.label}</span>
                  {layer === o.id && <Check className="size-4 text-lime" aria-hidden />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {/* The one-line date card stays visible on phones: without the date the image would look like today. */}
      {layer === "latest" ? (
        <LatestImageCard latest={latest} />
      ) : (
        <div className="hidden md:block">
          <LayerLegend layer={active} />
        </div>
      )}
    </div>
  );
}
