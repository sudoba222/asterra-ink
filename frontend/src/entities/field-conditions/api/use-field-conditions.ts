"use client";

import { useCallback, useEffect, useState } from "react";
import type { LonLat } from "@/entities/field";
import { readApiError } from "@/shared/api";
import type { FieldConditions } from "../model/types";

type State =
  | { status: "loading"; data: FieldConditions | null; error: null }
  | { status: "success"; data: FieldConditions; error: null }
  | { status: "error"; data: FieldConditions | null; error: string };

export type FieldConditionsState = State & { retry: () => void };

/** POSTs the field polygon to /api/field-conditions. */
export function useFieldConditions(polygon: LonLat[] | null): FieldConditionsState {
  const [state, setState] = useState<State>({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = polygon ? JSON.stringify(polygon) : null;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start of an external request
    setState((s) => ({ status: "loading", data: s.data, error: null }));
    fetch("/api/field-conditions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polygon: JSON.parse(key) }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        const body = (await res.json()) as FieldConditions;
        setState({ status: "success", data: body, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState((s) => ({ status: "error", data: s.data, error: e instanceof Error ? e.message : String(e) }));
      });
    return () => ctrl.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
