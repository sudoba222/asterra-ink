/**
 * "Latest image": the newest cloud-free NASA HLS (Harmonized Landsat Sentinel-2) true-colour
 * picture of a field, from NASA GIBS. HLS has no rolling composite, so every day only
 * covers the places a satellite passed over; /api/latest-image finds the newest day that
 * shows the field clearly. Layer ids and tile matrix set checked against GIBS capabilities.
 */

export const HLS_PRODUCTS = {
  S30: { gibsId: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", satellite: "Sentinel-2" },
  L30: { gibsId: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", satellite: "Landsat 8/9" },
} as const;

export type HlsProduct = keyof typeof HLS_PRODUCTS;

export const HLS_TILE_MATRIX_SET = "GoogleMapsCompatible_Level12";
export const HLS_MAX_LEVEL = 12;

export interface LatestImage {
  /** YYYY-MM-DD (UTC) */
  date: string;
  product: HlsProduct;
  satellite: string;
  /** Share of the field seen without cloud or gaps, 0–1. */
  clearShare: number;
}

export interface LatestImageAnswer {
  /** null when no clear image was found in the searched window. */
  image: LatestImage | null;
  /** How many days back were searched. */
  searchedDays: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function hlsTileUrl(product: HlsProduct, date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${HLS_PRODUCTS[product].gibsId}/default/${date}/${HLS_TILE_MATRIX_SET}/{z}/{y}/{x}.png`;
}
