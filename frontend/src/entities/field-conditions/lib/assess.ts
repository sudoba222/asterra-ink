import type { CardState, ConditionInputs, DayObservation, FieldAssessment, Recommendation } from "../model/types";

/**
 * Transparent rules that turn real observations + forecast into four plain-language
 * cards and one recommendation. No machine learning, no invented values: if an input
 * is missing the card says so. Thresholds are ASTERRA rules of thumb, listed here.
 */
export const RULES = {
  soil: { dry: 30, aBitDry: 45, veryWet: 75 }, // root-zone wetness, % of saturation
  coldSeasonMeanC: 5, // 7-day mean below this → crops dormant
  frostC: 0,
  heatC: 35,
  rainExpectedMm: 5, // 3-day forecast
  deficitMm: 10, // 7-day ET₀ − rain
  ndvi: { poor: 0.3, fair: 0.5 },
  noCropNdvi: 0.2, // below this, no actively growing crop is visible
  ndviDrop: 0.1,
  lowDemandMmDay: 1.5, // ET₀ below this → crops use little water
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

function lastWith<K extends keyof DayObservation>(days: DayObservation[], key: K) {
  for (let i = days.length - 1; i >= 0; i--) if (days[i][key] !== null) return days[i];
  return null;
}

function sumLast(days: DayObservation[], key: "rain" | "et0", n: number): number | null {
  const v = days.slice(-n).map((d) => d[key]).filter((x): x is number => x !== null);
  return v.length >= Math.ceil(n * 0.7) ? v.reduce((a, b) => a + b, 0) : null;
}

function meanLast(days: DayObservation[], key: "t2m", n: number): number | null {
  const v = days.slice(-n).map((d) => d[key]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const unknown = (label = "No data"): CardState => ({ level: "unknown", label, value: "—", detail: "We couldn’t load this right now.", asOf: null });

export function assessField(input: ConditionInputs): FieldAssessment {
  const { history, forecast, ndvi, ndviLastYear } = input;
  const fc = forecast.filter((d) => d.tMax !== null || d.rain !== null);
  const today = fc[0] ?? null;
  const fcRain = fc.length ? fc.reduce((s, d) => s + (d.rain ?? 0), 0) : null;
  const fcMax = fc.length ? Math.max(...fc.map((d) => d.tMax ?? -99)) : null;
  const fcMin = fc.length ? Math.min(...fc.map((d) => d.tMin ?? 99)) : null;
  const frostDay = fc.find((d) => d.tMin !== null && d.tMin <= RULES.frostC) ?? null;
  const heatDay = fc.find((d) => d.tMax !== null && d.tMax >= RULES.heatC) ?? null;

  const mean7 = meanLast(history, "t2m", 7);
  const rain7 = sumLast(history, "rain", 7);
  const et07 = sumLast(history, "et0", 7);
  const coldSeason = mean7 !== null && mean7 < RULES.coldSeasonMeanC;
  const noCrop = ndvi !== null && ndvi.mean < RULES.noCropNdvi;
  const fcEt0 = fc.map((d) => d.et0).filter((x): x is number => x !== null);
  const demandPerDay = fcEt0.length ? fcEt0.reduce((a, b) => a + b, 0) / fcEt0.length : et07 !== null ? et07 / 7 : null;
  const lowDemand = demandPerDay !== null && demandPerDay < RULES.lowDemandMmDay;

  /* ---------- Temperature ---------- */
  let temperature: CardState;
  const latestT = lastWith(history, "t2m");
  if (today && today.tMax !== null && today.tMin !== null) {
    const mean = (today.tMax + today.tMin) / 2;
    const label = mean < 5 ? "Cold" : mean < 15 ? "Cool" : mean < 28 ? "Warm" : "Hot";
    const extra = frostDay
      ? ` Frost is possible on ${shortDate(frostDay.date)} (${r0(frostDay.tMin!)} °C).`
      : heatDay
        ? ` Very hot on ${shortDate(heatDay.date)} (${r0(heatDay.tMax!)} °C).`
        : "";
    temperature = {
      level: frostDay || heatDay ? "alert" : "good",
      label,
      value: `${r0(today.tMax)}° / ${r0(today.tMin)}°`,
      detail: `Today about ${r0(today.tMax)} °C by day and ${r0(today.tMin)} °C at night.${extra}`,
      asOf: "Today (forecast)",
    };
  } else if (latestT) {
    const t = latestT.t2m!;
    temperature = {
      level: "neutral",
      label: t < 5 ? "Cold" : t < 15 ? "Cool" : t < 28 ? "Warm" : "Hot",
      value: `${r0(t)} °C`,
      detail: `Average air temperature on ${shortDate(latestT.date)}.`,
      asOf: shortDate(latestT.date),
    };
  } else temperature = unknown();

  /* ---------- Soil moisture ---------- */
  let soil: CardState;
  const latestW = lastWith(history, "wetness");
  const w = latestW?.wetness ?? null;
  if (latestW && w !== null) {
    const weekAgo = history[history.indexOf(latestW) - 7]?.wetness ?? null;
    const trend =
      weekAgo === null ? "" : w - weekAgo <= -3 ? " It has been drying over the past week." : w - weekAgo >= 3 ? " It got wetter over the past week." : "";
    const label = w < RULES.soil.dry ? "Dry" : w < RULES.soil.aBitDry ? "A bit dry" : w <= RULES.soil.veryWet ? "Good" : "Very wet";
    soil = {
      level: w < RULES.soil.dry ? "alert" : w < RULES.soil.aBitDry || w > RULES.soil.veryWet ? "watch" : "good",
      label,
      value: `${r0(w)} %`,
      detail: `The soil around the roots holds ${r0(w)} % of the water it can hold.${trend}`,
      asOf: shortDate(latestW.date),
    };
  } else soil = unknown();

  /* ---------- Crop health ---------- */
  let crop: CardState;
  if (ndvi) {
    const v = ndvi.mean;
    // Same threshold as the irrigation card's "No crop seen", so the two cards never disagree.
    const label = v < RULES.noCropNdvi ? "Little or no crop" : v < RULES.ndvi.poor ? "Poor" : v < RULES.ndvi.fair ? "Fair" : "Healthy";
    let compare = "";
    if (ndviLastYear) {
      const d = v - ndviLastYear.mean;
      compare = d >= 0.05 ? " Greener than this time last year." : d <= -0.05 ? " Less green than this time last year." : " Similar to this time last year.";
    }
    const note =
      v < RULES.noCropNdvi
        ? " This is normal before planting or after harvest."
        : v < RULES.ndvi.poor
          ? " If a crop is growing now, take a look at it — low values are also normal before planting or after harvest."
          : "";
    crop = {
      level: v < RULES.noCropNdvi ? "neutral" : v < RULES.ndvi.poor ? "watch" : "good",
      label,
      value: `NDVI ${v.toFixed(2)}`,
      detail: `Plant greenness seen from space.${compare}${note}`,
      asOf: ndvi.date ? shortDate(ndvi.date) : null,
    };
  } else crop = unknown("No image");

  /* ---------- Irrigation ---------- */
  let irrigation: CardState;
  const rainComing = fcRain !== null && fcRain >= RULES.rainExpectedMm;
  const deficit = rain7 !== null && et07 !== null ? et07 - rain7 : null;
  if (w === null) irrigation = unknown();
  else if (coldSeason) {
    irrigation = { level: "neutral", label: "Not needed", value: "Cold season", detail: "Crops use little water when it is this cold.", asOf: soil.asOf };
  } else if (noCrop) {
    irrigation = {
      level: "neutral",
      label: "Not needed now",
      value: "No crop seen",
      detail: "The satellite sees little or no growing crop. If you have just sown, keep the topsoil moist.",
      asOf: crop.asOf,
    };
  } else if (w < RULES.soil.dry && !rainComing && (deficit === null || deficit > 0) && !lowDemand) {
    irrigation = { level: "alert", label: "Needed now", value: "Within 24 h", detail: "The soil is dry and no real rain is expected.", asOf: soil.asOf };
  } else if (w < RULES.soil.dry && !rainComing) {
    irrigation = {
      level: "watch",
      label: "Check soon",
      value: "In 2–3 days",
      detail: lowDemand ? "The soil is dry, but crops use little water right now. Check again in a few days." : "The soil is dry, but recent rain helped. Check again in a few days.",
      asOf: soil.asOf,
    };
  } else if (w < RULES.soil.aBitDry && deficit !== null && deficit > RULES.deficitMm && !rainComing) {
    irrigation = {
      level: "watch",
      label: "Soon",
      value: "In 2–3 days",
      detail: `Crops used about ${r0(deficit)} mm more water than fell as rain last week.`,
      asOf: soil.asOf,
    };
  } else if (rainComing && w <= RULES.soil.veryWet) {
    irrigation = { level: "good", label: "Not needed", value: `${r1(fcRain!)} mm rain`, detail: "Rain is expected in the next 3 days.", asOf: "Next 3 days (forecast)" };
  } else {
    irrigation = { level: "good", label: "Not needed", value: "OK", detail: w > RULES.soil.veryWet ? "The soil is already very wet." : "The soil has enough water for now.", asOf: soil.asOf };
  }

  /* ---------- One recommendation (priority order) ---------- */
  const reasons: string[] = [];
  if (w !== null && latestW) reasons.push(`Root-zone soil moisture: ${r0(w)} % on ${shortDate(latestW.date)} (NASA POWER).`);
  if (rain7 !== null) reasons.push(`Rain in the last 7 days: ${r1(rain7)} mm${et07 !== null ? `; crop water use (ET₀): ${r1(et07)} mm` : ""}.`);
  if (fcRain !== null) reasons.push(`Rain forecast for the next 3 days: ${r1(fcRain)} mm (Open-Meteo).`);
  if (fcMax !== null && fcMin !== null && fc.length) reasons.push(`Forecast temperatures: ${r0(fcMin)} °C to ${r0(fcMax)} °C.`);
  if (ndvi) reasons.push(`Field greenness (NDVI): ${ndvi.mean.toFixed(2)}${ndviLastYear ? ` vs ${ndviLastYear.mean.toFixed(2)} a year ago` : ""} (NASA MODIS).`);

  let rec: Omit<Recommendation, "reasons">;
  const ndviDropped = ndvi && ndviLastYear && ndvi.mean - ndviLastYear.mean <= -RULES.ndviDrop && ndvi.mean < RULES.ndvi.fair;
  if (!latestW && !today && !ndvi) {
    rec = { level: "unknown", title: "We couldn’t load data for your field right now. Please try again in a moment." };
  } else if (frostDay && !coldSeason) {
    rec = { level: "alert", title: `Frost is possible on ${shortDate(frostDay.date)}. Protect young plants and avoid irrigating in the evening.` };
  } else if (heatDay) {
    rec = { level: "alert", title: `Very hot weather on ${shortDate(heatDay.date)} (${r0(heatDay.tMax!)} °C). Water early in the morning or in the evening.` };
  } else if (irrigation.label === "Needed now") {
    rec = { level: "alert", title: "Your soil moisture is low. Irrigate your field within the next 24 hours." };
  } else if (irrigation.label === "Soon") {
    rec = { level: "watch", title: "Your soil is drying and no rain is expected. Plan to irrigate in the next 2–3 days." };
  } else if (noCrop && !coldSeason) {
    rec = {
      level: "neutral",
      title:
        w === null
          ? "No growing crop is visible on your field right now. Check the soil moisture by hand before sowing."
          : w < RULES.soil.aBitDry
            ? "No growing crop is visible on your field right now. If you plan to sow soon, the soil is on the dry side — consider watering before sowing."
            : "No growing crop is visible on your field right now. The soil has enough moisture for sowing.",
    };
  } else if (irrigation.label === "Check soon") {
    rec = { level: "watch", title: "Your soil is dry. Check it again in 2–3 days and irrigate if it stays dry." };
  } else if (rainComing && !coldSeason) {
    rec = { level: "good", title: `Rain is expected (about ${r1(fcRain!)} mm in 3 days). You don’t need to irrigate now.` };
  } else if (ndviDropped && !coldSeason) {
    rec = { level: "watch", title: "Your field is less green than last year at this time. Check it for pests, disease or water stress." };
  } else if (w !== null && w > RULES.soil.veryWet) {
    rec = { level: "watch", title: "The soil is very wet. Don’t irrigate, and keep heavy machinery off the field." };
  } else if (coldSeason) {
    rec = { level: "neutral", title: "It’s the cold season, so crops grow slowly. No irrigation is needed right now." };
  } else if (w === null) {
    // Never call conditions "good" without the soil reading that irrigation advice depends on.
    rec = { level: "unknown", title: "Soil moisture data isn’t available right now, so we can’t advise on watering. Check the soil by hand before you irrigate." };
  } else {
    rec = { level: "good", title: "Conditions look good. No action is needed today." };
  }

  return { temperature, soil, crop, irrigation, recommendation: { ...rec, reasons } };
}
