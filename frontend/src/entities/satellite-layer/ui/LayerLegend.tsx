"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { gibsProbeUrl, type SatelliteLayer } from "../model/layers";
import { formatDate } from "@/shared/lib";

/** Reads the actual imagery date GIBS served for time=default. */
function useImageryDate(layer: SatelliteLayer | null) {
  const [date, setDate] = useState<{ id: string; value: string | null } | null>(null);
  useEffect(() => {
    if (!layer) return;
    const ctrl = new AbortController();
    fetch(gibsProbeUrl(layer), { signal: ctrl.signal })
      .then((r) => setDate({ id: layer.id, value: r.headers.get("layer-time-actual") }))
      .catch(() => {
        if (!ctrl.signal.aborted) setDate({ id: layer.id, value: null });
      });
    return () => ctrl.abort();
  }, [layer]);
  return layer && date?.id === layer.id ? date.value : undefined;
}

export function LayerLegend({ layer }: { layer: SatelliteLayer | null }) {
  const date = useImageryDate(layer);
  return (
    <AnimatePresence mode="wait">
      {layer && (
        <motion.div
          key={layer.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22 }}
          className="glass w-[min(300px,calc(100vw-32px))] rounded-2xl p-3.5 text-white shadow-[var(--shadow-float)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold">{layer.label}</p>
              <p className="text-[11.5px] text-white/60">{layer.measures}</p>
            </div>
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10.5px] text-white/70">{layer.spatialResolution}</span>
          </div>
          {layer.legend && (
            <div className="mt-3">
              <div
                className="h-2 rounded-full"
                style={{ background: `linear-gradient(90deg, ${layer.legend.map((s) => s.color).join(", ")})` }}
                aria-hidden
              />
              <div className="mt-1 flex justify-between font-mono text-[10.5px] text-white/65">
                <span>{layer.legendMin}</span>
                <span className="font-sans text-white/50">{layer.unit}</span>
                <span>{layer.legendMax}</span>
              </div>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-white/45">Imagery date</dt>
            <dd className="text-right text-white/85">{date === undefined ? "Loading…" : date ? formatDate(date) : "Latest available"}</dd>
            <dt className="text-white/45">Cadence</dt>
            <dd className="text-right text-white/85">{layer.temporalResolution}</dd>
          </dl>
          <p className="mt-2.5 border-t border-white/10 pt-2 text-[11px] leading-4 text-white/55">{layer.caveat}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
