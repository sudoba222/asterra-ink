import "server-only";
import { fetchPowerMonthly, type PowerMonthly, type PowerParameter } from "@/shared/api/nasa/power";
import { hargreavesEt0, mean, pctChange, sum } from "@/shared/lib";
import { daysInMonth, monthRange } from "../lib/periods";
import type {
  AnalysisPoint,
  DataStatus,
  EnvironmentalProfile,
  Indicator,
  IndicatorId,
  MonthlySeries,
  PeriodId,
  Provenance,
  SourceId,
  Trend,
} from "../model/types";

const PERIOD_MONTHS: Record<PeriodId, number> = { "12m": 12, "36m": 36 };

/** Latest month that has a temperature value — POWER publishes with a lag. */
function lastValidMonth(power: PowerMonthly): string | null {
  const keys = Object.keys(power.parameters.T2M)
    .filter((k) => power.parameters.T2M[k] !== null)
    .sort();
  return keys.at(-1) ?? null;
}

function previousMonth(today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getEnvironmentalProfile(point: AnalysisPoint, periodId: PeriodId): Promise<EnvironmentalProfile> {
  const n = PERIOD_MONTHS[periodId];
  const now = new Date();
  const endYear = now.getUTCFullYear();
  // Enough history for the current period + an equally long comparison period (+1y for lag).
  const startYear = endYear - Math.ceil((n * 2) / 12) - 1;

  const warnings: string[] = [];
  const sources: Provenance[] = [];

  // No sample fallback: if NASA POWER is unreachable the caller gets an error, never invented values.
  const power: PowerMonthly = await fetchPowerMonthly(round2(point.lat), round2(point.lon), startYear, endYear);

  const end = lastValidMonth(power) ?? previousMonth(now);
  const months = monthRange(end, n * 2);
  const climateStatus: DataStatus = "live";
  const climateSource: SourceId = "nasa-power";
  const derivedStatus: DataStatus = "derived";
  const derivedSource: SourceId = "asterra-derived";
  const pick = (p: PowerParameter): Array<number | null> => months.map((m) => power.parameters[p][m] ?? null);

  {
    sources.push({
      sourceId: "nasa-power",
      product: `NASA POWER monthly point (${power.sources.join(", ") || "MERRA-2"})`,
      endpoint: power.url,
      spatialResolution: "≈0.5° × 0.625° grid cell",
      temporalResolution: "Monthly",
      retrievedAt: power.retrievedAt,
      status: "live",
      note: "Gridded estimate for the cell containing the analysis point — not field-level.",
    });
    sources.push({
      sourceId: "asterra-derived",
      product: "Reference evapotranspiration ET₀ (FAO-56 Hargreaves) + climatic water balance",
      endpoint: "Computed by ASTERRA from POWER T2M, T2M_RANGE and latitude",
      spatialResolution: "Same as NASA POWER",
      temporalResolution: "Monthly",
      retrievedAt: power.retrievedAt,
      status: "derived",
      note: "Hargreaves is the FAO-56 fallback when measured radiation/humidity/wind are unavailable; accuracy ≈ ±10–15 % monthly.",
    });
  }

  // --- unit conversions -----------------------------------------------------
  const t2m = pick("T2M");
  const tmax = pick("T2M_MAX");
  const tmin = pick("T2M_MIN");
  const precipMonth = pick("PRECTOTCORR").map((v, i) => (v === null ? null : round1(v * daysInMonth(months[i]))));
  const wetness = pick("GWETROOT").map((v) => (v === null ? null : round1(v * 100)));
  // Reference evapotranspiration ET₀ (FAO-56 Hargreaves) from POWER mean temperature + mean daily range.
  const range = pick("T2M_RANGE");
  const etMonth = t2m.map((t, i) =>
    t === null || range[i] === null
      ? null
      : round1(hargreavesEt0(t, range[i]!, point.lat, Number(months[i].slice(5))) * daysInMonth(months[i])),
  );
  const balance = precipMonth.map((p, i) => (p === null || etMonth[i] === null ? null : round1(p - etMonth[i]!)));

  const series = {
    precipitation: mk("precipitation", "mm", precipMonth),
    temperature: mk("temperature", "°C", t2m),
    temperatureMax: mk("temperatureMax", "°C", tmax),
    temperatureMin: mk("temperatureMin", "°C", tmin),
    soilMoisture: mk("soilMoisture", "%", wetness),
    evapotranspiration: { ...mk("evapotranspiration", "mm", etMonth), status: derivedStatus, sourceId: derivedSource },
  };

  function mk(indicator: MonthlySeries["indicator"], unit: string, values: Array<number | null>): MonthlySeries {
    return { indicator, unit, status: climateStatus, sourceId: climateSource, values: zip(months, values) };
  }

  const cur = (v: Array<number | null>) => v.slice(-n);
  const cmp = (v: Array<number | null>) => v.slice(0, n);
  const years = n / 12;
  const period = { start: months[n], end: months.at(-1)! };
  const comparisonLabel = periodId === "12m" ? "vs previous 12 months" : "vs previous 36 months";
  const annualTotal = (v: Array<number | null>) => {
    const s = sum(v);
    // Only report a total if most months are present.
    return s === null || v.filter((x) => x !== null).length < v.length * 0.8 ? null : round1(s / years);
  };

  function trendOf(curV: number | null, cmpV: number | null, withPercent: boolean): Trend | null {
    if (curV === null || cmpV === null) return null;
    return { delta: round1(curV - cmpV), percent: withPercent ? round1(pctChange(curV, cmpV) ?? 0) : null, comparisonLabel };
  }

  const ind = (
    id: IndicatorId,
    label: string,
    unit: string,
    aggregation: Indicator["aggregation"],
    values: Array<number | null>,
    agg: (v: Array<number | null>) => number | null,
    withPercent: boolean,
    description: string,
    status: DataStatus = climateStatus,
    sourceId: SourceId = climateSource,
  ): Indicator => {
    const c = agg(cur(values));
    const p = agg(cmp(values));
    return {
      id,
      label,
      unit,
      aggregation,
      value: c === null ? null : round2(c),
      period,
      trend: trendOf(c, p, withPercent),
      status,
      sourceId,
      description,
      spark: cur(values),
    };
  };

  const indicators: Record<IndicatorId, Indicator> = {
    temperature: ind("temperature", "Temperature", "°C", "mean", t2m, mean, false, "Average air temperature 2 m above ground."),
    precipitation: ind("precipitation", "Precipitation", "mm/yr", "total", precipMonth, annualTotal, true, "Total rain and snow, per year."),
    soilMoisture: ind(
      "soilMoisture",
      "Soil moisture",
      "%",
      "mean",
      wetness,
      mean,
      false,
      "Root-zone wetness: 0 % = completely dry, 100 % = saturated.",
    ),
    evapotranspiration: ind(
      "evapotranspiration",
      "Evapotranspiration",
      "mm/yr",
      "total",
      etMonth,
      annualTotal,
      true,
      "Reference crop water demand (ET₀): how much water a well-watered grass crop would use. Computed with the FAO-56 Hargreaves equation from NASA POWER temperatures.",
      derivedStatus,
      derivedSource,
    ),
    waterBalance: ind(
      "waterBalance",
      "Water availability",
      "mm/yr",
      "total",
      balance,
      annualTotal,
      false,
      "Climatic water balance: precipitation minus reference evapotranspiration (ET₀). Negative = rain alone does not meet crop water demand.",
      derivedStatus,
      derivedSource,
    ),
  };

  return {
    point,
    period: { id: periodId, ...period, comparisonStart: months[0], comparisonEnd: months[n - 1], months: n },
    indicators,
    series,
    sources,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

function zip(months: string[], values: Array<number | null>) {
  return months.map((month, i) => ({ month, value: values[i] ?? null }));
}
function round1(v: number) {
  return Math.round(v * 10) / 10;
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
