/**
 * Common environmental data model consumed by every dashboard widget.
 * Adapters (NASA POWER, MODIS/HLS NDVI, SMAP, GPM, …) map their responses into
 * this shape so the UI never depends on a specific API.
 */

export type DataStatus = "live" | "sample" | "derived" | "unavailable";

export type IndicatorId =
  | "temperature"
  | "precipitation"
  | "soilMoisture"
  | "evapotranspiration"
  | "waterBalance";

export type PeriodId = "12m" | "36m";

export interface AnalysisPoint {
  lat: number;
  lon: number;
  /** "reference" = dataset centre of the country; "custom" = user picked on the globe. */
  kind: "reference" | "custom";
}

export interface Provenance {
  sourceId: SourceId;
  /** Human-readable product name, e.g. "NASA POWER (MERRA-2) monthly point". */
  product: string;
  /** Request URL / endpoint actually used (never contains secrets). */
  endpoint: string;
  spatialResolution: string;
  temporalResolution: string;
  retrievedAt: string | null;
  status: DataStatus;
  note?: string;
}

export type SourceId = "nasa-power" | "modis-ndvi" | "smap" | "gpm-imerg" | "asterra-derived" | "sample";

/** One calendar month, "YYYY-MM". */
export interface MonthlyValue {
  month: string;
  value: number | null;
}

export interface MonthlySeries {
  indicator: IndicatorId | "temperatureMax" | "temperatureMin";
  unit: string;
  status: DataStatus;
  sourceId: SourceId;
  /** Chronological, most recent last. Covers current + comparison period. */
  values: MonthlyValue[];
}

export interface Trend {
  /** Absolute difference vs comparison period (same unit as the indicator). */
  delta: number;
  /** Relative change in %, when meaningful (null for e.g. °C or 0–1 indices). */
  percent: number | null;
  comparisonLabel: string;
}

export interface Indicator {
  id: IndicatorId;
  label: string;
  /** Headline value over the selected period (mean or total, see `aggregation`). */
  value: number | null;
  unit: string;
  aggregation: "mean" | "total" | "latest";
  period: { start: string; end: string };
  trend: Trend | null;
  status: DataStatus;
  sourceId: SourceId;
  /** Short plain-language explanation for non-experts. */
  description: string;
  /** Series for the sparkline (selected period only). */
  spark: Array<number | null>;
}

export interface EnvironmentalProfile {
  point: AnalysisPoint;
  period: { id: PeriodId; start: string; end: string; comparisonStart: string; comparisonEnd: string; months: number };
  indicators: Record<IndicatorId, Indicator>;
  series: {
    precipitation: MonthlySeries | null;
    temperature: MonthlySeries | null;
    temperatureMax: MonthlySeries | null;
    temperatureMin: MonthlySeries | null;
    soilMoisture: MonthlySeries | null;
    evapotranspiration: MonthlySeries | null;
  };
  sources: Provenance[];
  warnings: string[];
  generatedAt: string;
}
