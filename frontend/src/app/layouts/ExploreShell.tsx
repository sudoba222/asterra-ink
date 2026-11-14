"use client";

import type { ReactNode } from "react";
import { useExploration } from "@/entities/exploration";
import { ZoomControls } from "@/entities/map";
import { DrawToolbar, useFieldDraft } from "@/features/draw-field";
import { cn } from "@/shared/lib";
import { EarthGlobe } from "@/widgets/earth-globe";

/**
 * One persistent globe for every route.
 *  - home / finder: the map fills the screen; small panels float on top
 *  - field: the map becomes the right column (≥ split breakpoint) or a top band (narrow)
 */
export function ExploreShell({ children }: { children: ReactNode }) {
  const { mode } = useExploration();
  const draft = useFieldDraft();

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-abyss">
      <div
        className={cn(
          "fixed z-0 overflow-hidden transition-[top,right,bottom,left,border-radius] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          mode === "field"
            ? "top-0 right-0 bottom-[60dvh] left-0 split:top-3 split:right-3 split:bottom-3 split:left-[calc(100%-var(--globe-split))] split:rounded-[28px]"
            : "top-0 right-0 bottom-0 left-0 rounded-none",
        )}
      >
        <EarthGlobe spin={mode === "home" && draft.status === "off"} />
        <ZoomControls
          className={cn(
            "pointer-events-auto absolute right-3 z-20",
            mode === "field" ? "bottom-3 split:bottom-5 split:right-5" : "top-1/2 -translate-y-1/2 sm:right-6",
          )}
        />
      </div>
      <div className="pointer-events-none relative z-10 h-full">
        {children}
        {mode !== "field" && <DrawToolbar />}
      </div>
    </div>
  );
}
