import "server-only";
import type { LonLat } from "@/entities/field";
import { fetchPowerDaily } from "@/shared/api/nasa/power-daily";
import { sampleNdvi } from "@/shared/api/nasa/gibs-ndvi";
import { fetchForecast } from "@/shared/api/open-meteo";
import { hargreavesEt0Daily } from "@/shared/lib";
import { assessField } from "../lib/assess";
import type { DayObservation, FieldConditions, NdviReading, SourceStatus } from "../model/types";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const compact = (iso: string) => iso.replaceAll("-", "");

function centroidOf(ring: LonLat[]) {
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lat, lon };
}

function minusYear(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(y) - 1}-${m}-${m === "02" && d === "29" ? "28" : d}`;
}

/** Gathers real data for a field polygon. Each source can fail independently. */
export async function getFieldConditions(ring: LonLat[]): Promise<FieldConditions> {
  const c = centroidOf(ring);
  const now = new Date();
  const end = ymd(now);
  const start = ymd(new Date(now.getTime() - 40 * 86_400_000));
  // Round the ring a little so nearby edits share cache entries (≈1 m).
  const key: Array<[number, number]> = ring.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);

  const [powerR, forecastR, ndviR] = await Promise.allSettled([
    fetchPowerDaily(c.lat, c.lon, compact(start), compact(end)),
    fetchForecast(c.lat, c.lon),
    sampleNdvi(key, "default"),
  ]);

  const power = powerR.status === "fulfilled" ? powerR.value : null;
  const forecast = forecastR.status === "fulfilled" ? forecastR.value : null;
  const ndvi = ndviR.status === "fulfilled" ? ndviR.value : null;

  let ndviLastYear: Awaited<ReturnType<typeof sampleNdvi>> = null;
  if (ndvi?.date) {
    ndviLastYear = await sampleNdvi(key, minusYear(ndvi.date)).catch(() => null);
  }

  const history: DayObservation[] = (power?.days ?? []).map((d) => ({
    date: d.date,
    t2m: d.t2m,
    tMax: d.tMax,
    tMin: d.tMin,
    rain: d.rain,
    wetness: d.wetness === null ? null : Math.round(d.wetness * 1000) / 10,
    et0: d.tMax !== null && d.tMin !== null ? Math.round(hargreavesEt0Daily(d.tMax, d.tMin, c.lat, d.date) * 10) / 10 : null,
  }));

  const toReading = (s: typeof ndvi): NdviReading | null =>
    s ? { mean: s.mean, pixels: s.pixels, smallerThanPixel: s.smallerThanPixel, date: s.date } : null;

  const assessment = assessField({
    history,
    forecast: forecast?.days ?? [],
    ndvi: toReading(ndvi),
    ndviLastYear: toReading(ndviLastYear),
  });

  // Farmer-facing status stays generic; technical details go to the server log only.
  const reason = (r: PromiseSettledResult<unknown>, source: string) => {
    if (r.status !== "rejected") return "";
    console.error(`[field-conditions] ${source} failed:`, r.reason);
    return "the service couldn’t be reached. Please try again later";
  };
  const sources: SourceStatus[] = [
    {
      id: "nasa-power",
      name: "NASA POWER daily (MERRA-2) — temperature, rain, soil moisture",
      ok: Boolean(power?.days.length),
      detail: power ? `≈50 km grid · data until ${history.at(-1)?.date ?? "—"}` : `Unavailable: ${reason(powerR, "NASA POWER")}`,
      url: power?.url ?? null,
    },
    {
      id: "open-meteo",
      name: "Open-Meteo — 3-day weather forecast",
      ok: Boolean(forecast?.days.length),
      detail: forecast ? `Forecast from ${forecast.days[0]?.date ?? "—"} (not NASA data)` : `Unavailable: ${reason(forecastR, "Open-Meteo")}`,
      url: forecast?.url ?? null,
    },
    {
      id: "gibs-ndvi",
      name: "NASA MODIS Terra NDVI via GIBS — crop greenness",
      ok: Boolean(ndvi),
      detail: ndvi
        ? `${ndvi.resolution} · ${ndvi.pixels} pixel${ndvi.pixels === 1 ? "" : "s"} · image ${ndvi.date ?? "latest"}${ndvi.smallerThanPixel ? " · field smaller than one pixel" : ""}`
        : ndviR.status === "rejected"
          ? `Unavailable: ${reason(ndviR, "GIBS NDVI")}`
          : "No clear pixels (clouds or no data) for this field",
      url: null,
    },
  ];

  return {
    ...assessment,
    centroid: c,
    observedUntil: history.at(-1)?.date ?? null,
    forecastFrom: forecast?.days[0]?.date ?? null,
    history: history.slice(-30),
    forecast: forecast?.days ?? [],
    ndvi: toReading(ndvi),
    ndviLastYear: toReading(ndviLastYear),
    sources,
    generatedAt: now.toISOString(),
  };
}
