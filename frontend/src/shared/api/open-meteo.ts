import "server-only";
import { cacheLife } from "next/cache";

/**
 * Open-Meteo forecast API (free, no key; non-commercial use). Used ONLY for the
 * next 3 days so advice can be forward-looking; labelled as forecast in the UI.
 * Docs: https://open-meteo.com/en/docs
 */
export interface ForecastDay {
  date: string;
  rain: number | null; // mm
  tMax: number | null; // °C
  tMin: number | null; // °C
  et0: number | null; // mm (FAO-56 Penman-Monteith)
}

export interface Forecast {
  days: ForecastDay[];
  timezone: string | null;
  url: string;
  retrievedAt: string;
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  "use cache";
  cacheLife("hours");

  const qs = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    daily: "precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration",
    forecast_days: "3",
    timezone: "auto",
  });
  const base = process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast";
  const url = `${base}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const raw = (await res.json()) as {
    timezone?: string;
    daily?: {
      time: string[];
      precipitation_sum: Array<number | null>;
      temperature_2m_max: Array<number | null>;
      temperature_2m_min: Array<number | null>;
      et0_fao_evapotranspiration: Array<number | null>;
    };
  };
  const d = raw.daily;
  if (!d?.time) throw new Error("Open-Meteo response had no daily block");
  return {
    days: d.time.map((date, i) => ({
      date,
      rain: d.precipitation_sum[i] ?? null,
      tMax: d.temperature_2m_max[i] ?? null,
      tMin: d.temperature_2m_min[i] ?? null,
      et0: d.et0_fao_evapotranspiration[i] ?? null,
    })),
    timezone: raw.timezone ?? null,
    url,
    retrievedAt: new Date().toISOString(),
  };
}
