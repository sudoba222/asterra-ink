"use client";

import { useCallback, useEffect, useState } from "react";
import { readApiError } from "./http-error";

export type FetchState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: T | null; error: Error };

/**
 * Small fetch hook with abort-on-change and manual retry. `url = null` disables it.
 * Keeps the previous data while a new request loads so the UI doesn't flash.
 */
export function useFetchJson<T>(url: string | null): FetchState<T> & { retry: () => void } {
  const [state, setState] = useState<FetchState<T>>({ status: "idle", data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start of an external request
    setState((s) => ({ status: "loading", data: s.data, error: null }));
    fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ status: "success", data, error: null }))
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ status: "error", data: s.data, error: error instanceof Error ? error : new Error(String(error)) }));
      });
    return () => ctrl.abort();
  }, [url, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
