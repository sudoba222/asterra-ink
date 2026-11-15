"use client";

import { useEffect, useState } from "react";
import type { LonLat } from "@/entities/field";
import { readApiError } from "@/shared/api";
import type { FieldTerrain } from "../lib/field-calendar";

/** POSTs the field polygon to /api/field-terrain (NASA NASADEM slope and erosion risk). null data on error. */
export function useFieldTerrain(polygon: LonLat[] | null): { data: FieldTerrain | null; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; data: FieldTerrain | null }>({ key: null, data: null });
  const key = polygon ? JSON.stringify(polygon) : null;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch("/api/field-terrain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ polygon: JSON.parse(key) }), signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        setState({ key, data: (await res.json()) as FieldTerrain });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ key, data: null });
      });
    return () => ctrl.abort();
  }, [key]);

  return { data: state.key === key ? state.data : null, loading: state.key !== key };
}
