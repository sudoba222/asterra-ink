"use client";

import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/shared/api";
import type { BBox, LatestImage, LatestImageAnswer } from "../model/latest-image";

type State =
  | { status: "idle" | "loading"; image: null; error: null }
  | { status: "success"; image: LatestImage | null; error: null }
  | { status: "error"; image: null; error: string };

export type LatestImageState = State & {
  /** Search for the next clear image before the one shown. */
  older: () => void;
  /** Go back to the newest clear image. */
  newest: () => void;
  isNewest: boolean;
  searchedDays: number;
};

/** Finds the newest cloud-free NASA HLS image of the box via /api/latest-image. Does nothing while `enabled` is false. */
export function useLatestImage(bbox: BBox | null, enabled: boolean): LatestImageState {
  const [state, setState] = useState<State>({ status: "idle", image: null, error: null });
  const [before, setBefore] = useState<string | null>(null);
  const [searchedDays, setSearchedDays] = useState(60);
  const key = bbox && enabled ? `${bbox.west},${bbox.south},${bbox.east},${bbox.north}|${before ?? ""}` : null;

  useEffect(() => {
    if (!key || !bbox) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ west: String(bbox.west), south: String(bbox.south), east: String(bbox.east), north: String(bbox.north) });
    if (before) q.set("before", before);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start of an external request
    setState({ status: "loading", image: null, error: null });
    fetch(`/api/latest-image?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        const body = (await res.json()) as LatestImageAnswer;
        setSearchedDays(body.searchedDays);
        setState({ status: "success", image: body.image, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: "error", image: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers bbox and before
  }, [key]);

  const shown = state.status === "success" ? state.image : null;
  const older = useCallback(() => shown && setBefore(shown.date), [shown]);
  const newest = useCallback(() => setBefore(null), []);
  return { ...state, older, newest, isNewest: before === null, searchedDays };
}
