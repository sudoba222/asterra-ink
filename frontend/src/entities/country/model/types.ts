export interface Country {
  iso3: string;
  iso2: string;
  name: string;
  officialName: string;
  region: string;
  subregion: string;
  capital: string | null;
  /** Reference point from the world-countries dataset (approximate centre). */
  latlng: [number, number];
  areaKm2: number;
  landlocked: boolean;
  /** Lower-cased search terms: alt spellings, ISO codes, native names. */
  search: string;
}

export const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];
