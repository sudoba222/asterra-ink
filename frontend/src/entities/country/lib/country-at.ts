import { pointInGeometry } from "@/shared/lib";
import { loadCountryGeometry } from "./geometry";

/** One entry of /geo/index.json (generated at install by scripts/copy-static-assets.mjs). */
export interface CountryIndexEntry {
  iso3: string;
  /** [west, south, east, north] per polygon, degrees. */
  boxes: Array<[number, number, number, number]>;
}

let indexPromise: Promise<CountryIndexEntry[]> | null = null;

function loadIndex(): Promise<CountryIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = fetch("/geo/index.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Country index responded ${r.status}`);
        return r.json() as Promise<CountryIndexEntry[]>;
      })
      .catch((err) => {
        indexPromise = null; // allow a retry on the next click
        throw err;
      });
  }
  return indexPromise;
}

/** Countries whose polygon boxes contain the point, smallest box first (enclaves before their host). */
export function countryCandidates(index: CountryIndexEntry[], lon: number, lat: number): string[] {
  const hits: Array<{ iso3: string; area: number }> = [];
  for (const c of index) {
    let best = Infinity;
    for (const [w, s, e, n] of c.boxes) {
      if (lat >= s && lat <= n && lon >= w && lon <= e) best = Math.min(best, (e - w) * (n - s));
    }
    if (best < Infinity) hits.push({ iso3: c.iso3, area: best });
  }
  return hits.sort((a, b) => a.area - b.area).map((h) => h.iso3);
}

/**
 * ISO3 of the country at a point, or null over the sea / unclaimed land.
 * Uses real country borders (world-countries, simplified to ≈1 km) — no reverse-geocoding service.
 */
export async function countryAt(lon: number, lat: number): Promise<string | null> {
  const index = await loadIndex();
  for (const iso3 of countryCandidates(index, lon, lat)) {
    const g = await loadCountryGeometry(iso3);
    if (g && pointInGeometry(lon, lat, g.geometry)) return iso3;
  }
  return null;
}
