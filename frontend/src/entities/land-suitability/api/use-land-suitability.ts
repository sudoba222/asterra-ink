"use client";

import { useCallback, useEffect, useState } from "react";
import type { LonLat } from "@/entities/field";
import type { LandSuitability } from "../model/types";

type State =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: LandSuitability; error: null }
  | { status: "error"; data: null; error: string };

export type LandSuitabilityState = State & { retry: () => void };

/** POSTs the field polygon to /api/land-suitability. */
export function useLandSuitability(polygon: LonLat[] | null): LandSuitabilityState {
  const [state, setState] = useState<State>({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = polygon ? JSON.stringify(polygon) : null;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start of an external request
    setState({ status: "loading", data: null, error: null });
    fetch("/api/land-suitability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polygon: JSON.parse(key) }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setState({ status: "success", data: body as LandSuitability, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: "error", data: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
