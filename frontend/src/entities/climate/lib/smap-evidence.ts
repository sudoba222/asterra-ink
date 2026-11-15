/**
 * Turns NASA SMAP root-zone soil moisture (now and the same day a year ago) into evidence lines
 * for the rotation strategies. Transparent rule: a change of 10 % or more counts as drier / wetter.
 */
export interface SmapPoint {
  value: number;
  date: string | null;
}

export const SMAP_SOURCE = "NASA SMAP L4 (9 km)";
const CHANGE = 0.1;

const shortDate = (iso: string | null) => {
  if (!iso) return "now";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export function smapEvidence(now: SmapPoint | null, lastYear: SmapPoint | null): Array<{ text: string; source: string }> {
  if (!now) return [];
  const base = `Root-zone soil moisture on ${shortDate(now.date)}: ${now.value.toFixed(2)} m³/m³`;
  if (!lastYear || lastYear.value <= 0) return [{ text: `${base}.`, source: SMAP_SOURCE }];
  const change = (now.value - lastYear.value) / lastYear.value;
  const pct = Math.round(Math.abs(change) * 100);
  const vs = `${lastYear.value.toFixed(2)} ${lastYear.date ? `on ${shortDate(lastYear.date)}` : "a year earlier"}`;
  if (change <= -CHANGE)
    return [{ text: `${base}, ${pct} % drier than ${vs}. Crops that need less water are safer this season.`, source: SMAP_SOURCE }];
  if (change >= CHANGE) return [{ text: `${base}, ${pct} % wetter than ${vs}.`, source: SMAP_SOURCE }];
  return [{ text: `${base}, about the same as ${vs}.`, source: SMAP_SOURCE }];
}
