import "server-only";
import { cacheLife } from "next/cache";
import { powerApiRoot } from "./power-config";

/**
 * NASA POWER monthly point API adapter (live).
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
 */
/** T2M_MAX / T2M_MIN are the month's hourly peak / minimum; T2M_RANGE is the mean daily range. */
export const POWER_PARAMETERS = ["T2M", "T2M_MAX", "T2M_MIN", "T2M_RANGE", "PRECTOTCORR", "GWETROOT"] as const;
export type PowerParameter = (typeof POWER_PARAMETERS)[number];

export interface PowerMonthly {
  /** "YYYY-MM" → value (null where POWER returned the fill value). Annual ("13") rows removed. */
  parameters: Record<PowerParameter, Record<string, number | null>>;
  units: Record<PowerParameter, string>;
  elevation: number | null;
  sources: string[];
  url: string;
  retrievedAt: string;
}


export function powerRequestUrl(lat: number, lon: number, startYear: number, endYear: number): string {
  const base = `${powerApiRoot()}/monthly/point`;
  const qs = new URLSearchParams({
    parameters: POWER_PARAMETERS.join(","),
    community: "AG",
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start: String(startYear),
    end: String(endYear),
    format: "JSON",
  });
  return `${base}?${qs.toString()}`;
}

interface PowerRawResponse {
  geometry?: { coordinates?: [number, number, number] };
  properties?: { parameter?: Record<string, Record<string, number>> };
  header?: { fill_value?: number; sources?: string[] };
  parameters?: Record<string, { units: string }>;
  messages?: string[];
}

/** Cached for a day per (rounded) point + year range. Throws on network/API failure. */
export async function fetchPowerMonthly(lat: number, lon: number, startYear: number, endYear: number): Promise<PowerMonthly> {
  "use cache";
  cacheLife("days");

  const url = powerRequestUrl(lat, lon, startYear, endYear);
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`NASA POWER responded ${res.status}`);
  const raw = (await res.json()) as PowerRawResponse;
  const params = raw.properties?.parameter;
  if (!params) throw new Error("NASA POWER response had no parameter block");
  const fill = raw.header?.fill_value ?? -999;

  const parameters = {} as PowerMonthly["parameters"];
  const units = {} as PowerMonthly["units"];
  for (const p of POWER_PARAMETERS) {
    const series = params[p] ?? {};
    const out: Record<string, number | null> = {};
    for (const [key, v] of Object.entries(series)) {
      const month = key.slice(4);
      if (month === "13") continue; // annual aggregate
      out[`${key.slice(0, 4)}-${month}`] = v === fill || v === null || !Number.isFinite(v) ? null : v;
    }
    parameters[p] = out;
    units[p] = raw.parameters?.[p]?.units ?? "";
  }

  return {
    parameters,
    units,
    elevation: raw.geometry?.coordinates?.[2] ?? null,
    sources: raw.header?.sources ?? [],
    url,
    retrievedAt: new Date().toISOString(),
  };
}
