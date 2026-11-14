"use client";

import { useEffect } from "react";
import { flyToBBox, MapOutline, panelInset, useMap } from "@/entities/map";
import type { AdminArea } from "../model/use-admin-areas";

/** Outlines an admin area and flies the camera to it when it changes. */
export function AreaFocus({ area, minSpanDeg = 0.08 }: { area: AdminArea | null; minSpanDeg?: number }) {
  const map = useMap();
  const id = area?.id;
  useEffect(() => {
    if (map && area) flyToBBox(map, area.bbox, { minSpanDeg, pad: 0.08, inset: panelInset() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly once per area
  }, [map, id]);
  // Thin white line: context only, so it never competes with the farmer's lime field boundary.
  return <MapOutline geometry={area?.geometry ?? null} color="#F4F7F1" fillAlpha={0} width={1.5} />;
}
