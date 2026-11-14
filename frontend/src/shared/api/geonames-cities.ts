import "server-only";
import { cacheLife } from "next/cache";

/**
 * Cities and towns from GeoNames (CC BY 4.0, https://www.geonames.org), queried through
 * OpenDataSoft's public mirror of "all cities with a population > 1000"
 * (https://public.opendatasoft.com/explore/dataset/geonames-all-cities-with-a-population-1000/).
 * No API key. The mirror lets us ask for ONE country (≈30 KB) or the nearest town to a
 * point instead of downloading the 3 MB GeoNames dump, and every answer is cached.
 */
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  /** capital = national capital, admin = seat of a region/district, town = everything else. */
  kind: "capital" | "admin" | "town";
}

export interface CityList {
  cities: City[];
  /** Total matching places in GeoNames (the list is capped to the most populous). */
  total: number;
  source: string;
  license: string;
}

const DATASET = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000";
const SOURCE = "https://www.geonames.org";
const LICENSE = "CC BY 4.0 (GeoNames)";
const FIELDS = "geoname_id,name,population,coordinates,feature_code";
/** Sections of a city (PPLX), historical (PPLH), abandoned (PPLQ) and destroyed (PPLW) places are not towns to pick. */
const PLACES_ONLY = 'not feature_code in ("PPLX","PPLH","PPLQ","PPLW")';
export const CITY_LIST_LIMIT = 500;

interface OdsRow {
  geoname_id: string;
  name: string;
  population: number | null;
  coordinates: { lon: number; lat: number } | null;
  feature_code: string | null;
}

function toCity(r: OdsRow): City | null {
  if (!r.coordinates || !r.name) return null;
  const code = r.feature_code ?? "";
  return {
    id: String(r.geoname_id),
    name: r.name,
    lat: r.coordinates.lat,
    lon: r.coordinates.lon,
    population: r.population ?? 0,
    kind: code === "PPLC" ? "capital" : code.startsWith("PPLA") || code === "PPLG" ? "admin" : "town",
  };
}

function countryWhere(iso2: string) {
  if (!/^[A-Z]{2}$/.test(iso2)) throw new Error("Invalid ISO2 code");
  return `country_code="${iso2}" and ${PLACES_ONLY}`;
}

async function ods<T>(path: string, params: Record<string, string>, timeoutMs: number): Promise<T> {
  const url = `${DATASET}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GeoNames (OpenDataSoft) responded ${res.status}`);
  return (await res.json()) as T;
}

/** The most populous cities and towns of a country (capped at CITY_LIST_LIMIT). */
export async function getCountryCities(iso2: string): Promise<CityList> {
  "use cache";
  cacheLife("weeks");
  const where = countryWhere(iso2);
  const [rows, count] = await Promise.all([
    ods<OdsRow[]>("exports/json", { select: FIELDS, where, order_by: "population desc", limit: String(CITY_LIST_LIMIT) }, 30_000),
    ods<{ total_count: number }>("records", { where, limit: "0" }, 15_000).catch(() => null),
  ]);
  const cities = rows.map(toCity).filter((c): c is City => c !== null);
  return { cities, total: count?.total_count ?? cities.length, source: SOURCE, license: LICENSE };
}

/** Towns whose name matches `q` (for places outside the capped list). */
export async function searchCities(iso2: string, q: string): Promise<CityList> {
  "use cache";
  cacheLife("weeks");
  const term = q.replace(/["\\]/g, "").trim().slice(0, 60);
  const where = `${countryWhere(iso2)} and search(name, "${term}")`;
  const data = await ods<{ total_count: number; results: OdsRow[] }>("records", { select: FIELDS, where, order_by: "population desc", limit: "20" }, 15_000);
  const cities = data.results.map(toCity).filter((c): c is City => c !== null);
  return { cities, total: data.total_count, source: SOURCE, license: LICENSE };
}

/** The town nearest to a point (within `radiusKm`), e.g. where someone clicked on the globe. */
export async function nearestCity(iso2: string, lat: number, lon: number, radiusKm = 80): Promise<City | null> {
  "use cache";
  cacheLife("weeks");
  const point = `geom'POINT(${lon.toFixed(3)} ${lat.toFixed(3)})'`;
  const where = `${countryWhere(iso2)} and within_distance(coordinates, ${point}, ${radiusKm}km)`;
  const data = await ods<{ results: OdsRow[] }>(
    "records",
    { select: `${FIELDS},distance(coordinates, ${point}) as d`, where, order_by: "d", limit: "1" },
    15_000,
  );
  const row = data.results[0];
  return row ? toCity(row) : null;
}
