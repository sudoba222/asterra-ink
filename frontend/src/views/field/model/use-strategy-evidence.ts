"use client";

import { useMemo } from "react";
import type { ClimateTrend, SmapPoint } from "@/entities/climate";
import { fieldEvidence, type ClimateContext, type FieldEvidence, type FieldTerrain, type WaterTrendInfo } from "@/entities/crop";
import type { Field } from "@/entities/field";
import type { NdviHistoryState } from "@/entities/ndvi-history";
import { useFetchJson, usePostJson } from "@/shared/api";

interface SmapAnswer {
  now: SmapPoint | null;
  lastYear: SmapPoint | null;
  evidence: Array<{ text: string; source: string }>;
}

export interface StrategyEvidence {
  /** Undefined until the planning climate (ctx) is loaded. */
  field: FieldEvidence | undefined;
  /** Sources still loading, in farmer words (e.g. "field slope (NASA NASADEM)"). */
  pending: string[];
  /** Sources that failed: left out of the strategies, named on screen and in the PDF. */
  unavailable: string[];
}

/**
 * Loads the field data the rotation strategies use as evidence, on top of the planning climate:
 *   Sentinel-2 NDVI (passed in, shared with the NDVI chart) · NASA POWER 20-year trend · NASA SMAP ·
 *   NASA NASADEM slope (POST /api/field-terrain) · NASA/JPL GRACE water trend (GET /api/water-trend).
 * Every source is optional: a failed one is simply not used (ASTERRA never fills in sample values).
 */
export function useStrategyEvidence(field: Field, ctx: ClimateContext | null, ndvi: NdviHistoryState): StrategyEvidence {
  const at = new URLSearchParams({ lat: field.centroid.lat.toFixed(3), lon: field.centroid.lon.toFixed(3) }).toString();
  const terrainBody = useMemo(() => ({ polygon: field.polygon }), [field.polygon]);
  const terrain = usePostJson<FieldTerrain>("/api/field-terrain", terrainBody);
  const water = useFetchJson<WaterTrendInfo>(`/api/water-trend?${at}`);
  const trend = useFetchJson<ClimateTrend>(`/api/climate-trend?${at}`);
  const smap = useFetchJson<SmapAnswer>(`/api/smap?${at}`);

  const evidence = useMemo(
    () =>
      ctx
        ? fieldEvidence(ctx, ndvi.data?.series ?? [], [...(trend.data?.evidence ?? []), ...(smap.data?.evidence ?? [])], terrain.data, water.data)
        : undefined,
    [ctx, ndvi.data, trend.data, smap.data, terrain.data, water.data],
  );

  const sources: Array<[string, { status: string }]> = [
    ["field greenness history (Sentinel-2)", ndvi],
    ["20-year climate trend (NASA POWER)", trend],
    ["soil moisture (NASA SMAP)", smap],
    ["field slope (NASA NASADEM)", terrain],
    ["regional water trend (NASA GRACE)", water],
  ];
  // "idle" counts as loading: the request starts in an effect right after the first render.
  const pending = sources.filter(([, s]) => s.status === "loading" || s.status === "idle").map(([name]) => name);
  const unavailable = sources.filter(([, s]) => s.status === "error").map(([name]) => name);
  return { field: evidence, pending, unavailable };
}
