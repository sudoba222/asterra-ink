/** Shapes returned by /api/field-conditions and rendered by the field dashboard. */

export type Level = "good" | "watch" | "alert" | "neutral" | "unknown";

export interface DayObservation {
  date: string;
  t2m: number | null;
  tMax: number | null;
  tMin: number | null;
  rain: number | null;
  /** Root-zone wetness, % of saturation. */
  wetness: number | null;
  /** Reference ET₀ (FAO-56 Hargreaves), mm. */
  et0: number | null;
}

export interface ForecastDay {
  date: string;
  rain: number | null;
  tMax: number | null;
  tMin: number | null;
  et0: number | null;
}

export interface NdviReading {
  mean: number;
  pixels: number;
  smallerThanPixel: boolean;
  date: string | null;
}

export interface ConditionInputs {
  history: DayObservation[];
  forecast: ForecastDay[];
  ndvi: NdviReading | null;
  ndviLastYear: NdviReading | null;
}

export interface CardState {
  level: Level;
  /** Big plain word, e.g. "Good", "Dry", "Now". */
  label: string;
  /** One number, e.g. "38 %". */
  value: string;
  /** One short sentence in plain language. */
  detail: string;
  /** Date the value refers to, e.g. "Nov 11" (observed) or "Today (forecast)". */
  asOf: string | null;
}

export interface Recommendation {
  level: Level;
  title: string;
  reasons: string[];
}

export interface FieldAssessment {
  temperature: CardState;
  soil: CardState;
  crop: CardState;
  irrigation: CardState;
  recommendation: Recommendation;
}

export interface SourceStatus {
  id: "nasa-power" | "open-meteo" | "gibs-ndvi";
  name: string;
  ok: boolean;
  detail: string;
  url: string | null;
}

export interface FieldConditions extends FieldAssessment {
  centroid: { lat: number; lon: number };
  observedUntil: string | null;
  forecastFrom: string | null;
  history: DayObservation[];
  forecast: ForecastDay[];
  ndvi: NdviReading | null;
  ndviLastYear: NdviReading | null;
  sources: SourceStatus[];
  generatedAt: string;
}
