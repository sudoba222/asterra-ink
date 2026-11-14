import "server-only";
import { cacheLife } from "next/cache";
import { powerApiRoot } from "./power-config";

/**
 * NASA POWER daily point API (live). Recent days arrive with a ~2–4 day lag and
 * are returned as the fill value until processed; those are dropped here.
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 */
export interface PowerDay {
  date: string; // YYYY-MM-DD
  t2m: number | null;
  tMax: number | null;
  tMin: number | null;
  rain: number | null; // mm/day
  wetness: number | null; // GWETROOT 0–1
}

export interface PowerDaily {
  days: PowerDay[];
  url: string;
  retrievedAt: string;
}

const PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETROOT"] as const;

/** `start`/`end` as YYYYMMDD. Cached for a few hours per (rounded point, range). */
export async function fetchPowerDaily(lat: number, lon: number, start: string, end: string): Promise<PowerDaily> {
  "use cache";
  cacheLife("hours");

  const qs = new URLSearchParams({
    parameters: PARAMS.join(","),
    community: "AG",
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start,
    end,
    format: "JSON",
  });
  const url = `${powerApiRoot()}/daily/point?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`NASA POWER responded ${res.status}`);
  const raw = (await res.json()) as {
    properties?: { parameter?: Record<string, Record<string, number>> };
    header?: { fill_value?: number };
  };
  const p = raw.properties?.parameter;
  if (!p) throw new Error("NASA POWER response had no parameter block");
  const fill = raw.header?.fill_value ?? -999;
  const val = (k: (typeof PARAMS)[number], d: string) => {
    const v = p[k]?.[d];
    return v === undefined || v === fill || !Number.isFinite(v) ? null : v;
  };
  const days: PowerDay[] = Object.keys(p.T2M ?? {})
    .sort()
    .map((d) => ({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      t2m: val("T2M", d),
      tMax: val("T2M_MAX", d),
      tMin: val("T2M_MIN", d),
      rain: val("PRECTOTCORR", d),
      wetness: val("GWETROOT", d),
    }))
    .filter((d) => d.t2m !== null || d.wetness !== null);
  return { days, url, retrievedAt: new Date().toISOString() };
}
