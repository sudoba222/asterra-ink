"use client";

import type { Viewer } from "cesium";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CesiumModule } from "@/shared/lib/cesium";

export interface MapHandle {
  Cesium: CesiumModule;
  viewer: Viewer;
}

interface MapContextValue {
  map: MapHandle | null;
  setMap: (m: MapHandle | null) => void;
}

const Ctx = createContext<MapContextValue | null>(null);

/**
 * Publishes the single Cesium viewer (created by widgets/earth-globe) so features
 * like field drawing or area focus can attach behaviour without owning the globe.
 */
export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<MapHandle | null>(null);
  const value = useMemo(() => ({ map, setMap }), [map]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The live map, or null while the globe is loading / failed. */
export function useMap(): MapHandle | null {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMap must be used inside <MapProvider>");
  return v.map && !v.map.viewer.isDestroyed() ? v.map : null;
}

export function useRegisterMap() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRegisterMap must be used inside <MapProvider>");
  return v.setMap;
}
