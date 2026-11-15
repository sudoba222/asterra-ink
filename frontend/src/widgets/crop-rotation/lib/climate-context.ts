import type { EnvironmentalProfile } from "@/entities/climate";
import type { ClimateContext } from "@/entities/crop";

/** Monthly climate normals from the NASA POWER profile, in the shape the rotation engine expects. */
export function climateContext(p: EnvironmentalProfile): ClimateContext {
  const byMonth = (values: Array<{ month: string; value: number | null }> | undefined) => {
    const buckets: number[][] = Array.from({ length: 12 }, () => []);
    for (const v of values?.slice(-p.period.months) ?? []) {
      if (v.value !== null) buckets[Number(v.month.slice(5)) - 1].push(v.value);
    }
    return buckets.map((b) => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : null));
  };
  return {
    monthlyTemp: byMonth(p.series.temperature?.values),
    monthlyTmin: byMonth(p.series.temperatureMin?.values),
    annualRainfall: p.indicators.precipitation.value,
    status: p.indicators.precipitation.status,
    // Seasonal water balance inputs for the water-efficiency strategy (same POWER request, no extra fetch).
    monthlyRain: byMonth(p.series.precipitation?.values),
    monthlyEt0: byMonth(p.series.evapotranspiration?.values),
    monthlySoilMoisture: byMonth(p.series.soilMoisture?.values),
    // Heat months for the field calendar (same request).
    monthlyTmax: byMonth(p.series.temperatureMax?.values),
  };
}
