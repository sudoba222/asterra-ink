import { bboxOf, geometryFromGeoJson, type BBox, type CountryGeometry } from "@/shared/lib";

export interface LoadedCountryGeometry {
  geometry: CountryGeometry;
  bbox: BBox | null;
}

const cache = new Map<string, Promise<LoadedCountryGeometry | null>>();

/** Lazily fetches /geo/<ISO3>.json (generated at install). Returns null if missing. */
export function loadCountryGeometry(iso3: string): Promise<LoadedCountryGeometry | null> {
  const key = iso3.toUpperCase();
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/geo/${key}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (!fc) return null;
        const geometry = geometryFromGeoJson(fc);
        return { geometry, bbox: bboxOf(geometry) };
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
  }
  return p;
}
