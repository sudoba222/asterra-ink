/** One period of the Sentinel-2 NDVI history (answer of the ASTERRA backend `POST /fields/ndvi`). */
export interface NdviPeriod {
  from: string;
  to: string;
  /** null = no clear view of the field in this period (clouds, shadow, snow). */
  ndviMean: number | null;
  ndviMin: number | null;
  ndviMax: number | null;
  ndviStd: number | null;
  /** Share of the field seen without cloud, 0–1. */
  clearShare: number;
}

export interface NdviHistory {
  source: string;
  areaHectares: number;
  intervalDays: number;
  /** Periods without a satellite pass can be missing. */
  series: NdviPeriod[];
}
