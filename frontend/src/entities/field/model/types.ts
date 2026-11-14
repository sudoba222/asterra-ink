/** [longitude, latitude] in WGS84 degrees. */
export type LonLat = [number, number];

/** A farmer's field: an open ring of corners (first point is NOT repeated at the end). */
export interface Field {
  id: string;
  name: string;
  polygon: LonLat[];
  areaHa: number;
  centroid: { lat: number; lon: number };
  countryIso: string | null;
  regionName: string | null;
  districtName: string | null;
  /** Nearest city/town picked on the globe (GeoNames). Missing on fields saved before it existed. */
  cityName?: string | null;
  createdAt: string;
}
