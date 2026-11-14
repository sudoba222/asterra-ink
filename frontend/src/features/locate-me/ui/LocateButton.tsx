"use client";

import { Loader2, LocateFixed } from "lucide-react";
import { useCallback } from "react";
import { flyToPoint, useMap } from "@/entities/map";
import { cn } from "@/shared/lib";
import { useLocate } from "../model/use-locate";

/** "Use my location": flies close to the farmer, then calls `onLocated` (e.g. start marking). */
export function LocateButton({
  onLocated,
  className,
  variant = "primary",
}: {
  onLocated?: (lat: number, lon: number) => void;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const map = useMap();
  const onFound = useCallback(
    (lat: number, lon: number) => {
      if (map) flyToPoint(map, lat, lon, 3000, 2.6); // ≈4 km across: enough context to recognise your fields
      onLocated?.(lat, lon);
    },
    [map, onLocated],
  );
  const { state, locate } = useLocate(onFound);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={locate}
        disabled={state.status === "locating" || !map}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition",
          variant === "primary" ? "bg-lime text-deep hover:bg-lime-strong" : "bg-white/8 text-white ring-1 ring-white/12 hover:bg-white/14",
          "disabled:cursor-wait disabled:opacity-70",
        )}
      >
        {state.status === "locating" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
        {state.status === "locating" ? "Finding you…" : "Use my location"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-[12.5px] leading-5 text-[#ffc9a8]">
          {state.message}
        </p>
      )}
    </div>
  );
}
