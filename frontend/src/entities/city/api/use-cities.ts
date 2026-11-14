"use client";

import { useFetchJson } from "@/shared/api";
import type { City, CityList } from "../model/types";

/** Most populous cities/towns of a country (GeoNames). `iso3 = null` disables the request. */
export function useCities(iso3: string | null) {
  return useFetchJson<CityList>(iso3 ? `/api/cities?iso=${iso3}` : null);
}

/** Towns matching a typed name (for places outside the capped list). */
export function useCitySearch(iso3: string | null, q: string) {
  const term = q.trim();
  return useFetchJson<CityList>(iso3 && term.length >= 2 ? `/api/cities?iso=${iso3}&q=${encodeURIComponent(term)}` : null);
}

/** The town nearest to a point inside the country, or null if none within ~80 km. */
export async function fetchNearestCity(iso3: string, lat: number, lon: number, signal?: AbortSignal): Promise<City | null> {
  const res = await fetch(`/api/cities?iso=${iso3}&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Couldn’t look up the nearest town (${res.status}).`);
  }
  return ((await res.json()) as { city: City | null }).city;
}
