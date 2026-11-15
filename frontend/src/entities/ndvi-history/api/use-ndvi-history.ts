"use client";

import { useCallback, useEffect, useState } from "react";
import type { LonLat } from "@/entities/field";
import { readApiError } from "@/shared/api";
import type { NdviHistory } from "../model/types";

type State =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: NdviHistory; error: null }
  | { status: "error"; data: null; error: string };

export type NdviHistoryState = State & { retry: () => void };

/** POSTs the field polygon to /api/field-ndvi (Sentinel-2 NDVI, last 12 months). */
export function useNdviHistory(polygon: LonLat[] | null): NdviHistoryState {
  const [state, setState] = useState<State>({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = polygon ? JSON.stringify(polygon) : null;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start of an external request
    setState({ status: "loading", data: null, error: null });
    fetch("/api/field-ndvi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polygon: JSON.parse(key) }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        setState({ status: "success", data: (await res.json()) as NdviHistory, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: "error", data: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
