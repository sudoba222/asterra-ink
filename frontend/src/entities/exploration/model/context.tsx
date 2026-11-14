"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { Country } from "@/entities/country";

/**
 * Country list + the persistent shell's layout mode. Pages declare their mode with
 * `useShellMode()` instead of the layout reading the URL, so the layout never touches
 * runtime URL data (which would block prerendering under Cache Components).
 */
export type ShellMode = "home" | "finder" | "field";

interface ExplorationState {
  countries: Country[];
  byIso: Map<string, Country>;
  mode: ShellMode;
  setMode: (m: ShellMode) => void;
}

const Ctx = createContext<ExplorationState | null>(null);

export function ExplorationProvider({ countries, children }: { countries: Country[]; children: ReactNode }) {
  const byIso = useMemo(() => new Map(countries.map((c) => [c.iso3, c])), [countries]);
  const [mode, setMode] = useState<ShellMode>("home");
  const value = useMemo(() => ({ countries, byIso, mode, setMode }), [countries, byIso, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExploration(): ExplorationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExploration must be used inside <ExplorationProvider>");
  return v;
}

/** Call from a page view to set the shell layout before paint. */
export function useShellMode(mode: ShellMode) {
  const { setMode } = useExploration();
  useLayoutEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
}
