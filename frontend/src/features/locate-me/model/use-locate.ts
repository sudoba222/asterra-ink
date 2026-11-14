"use client";

import { useCallback, useState } from "react";

export type LocateState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; message: string };

const MESSAGES: Record<number, string> = {
  1: "Location access was blocked. Allow it in your browser settings, or choose your country instead.",
  2: "Your location isn’t available right now. Try again outdoors, or choose your country.",
  3: "Finding your location took too long. Please try again.",
};

/** Browser geolocation with farmer-friendly errors. Calls `onFound` with lat/lon. */
export function useLocate(onFound: (lat: number, lon: number) => void) {
  const [state, setState] = useState<LocateState>({ status: "idle" });
  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "error", message: "This browser can’t share your location. Please choose your country." });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({ status: "idle" });
        onFound(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => setState({ status: "error", message: MESSAGES[err.code] ?? "We couldn’t get your location." }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [onFound]);
  return { state, locate };
}
