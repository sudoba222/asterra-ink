const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" → "Mar 2026" (or "Mar ’26" when short). */
export function formatMonth(ym: string, short = false): string {
  const [y, m] = ym.split("-");
  const label = MONTHS[Number(m) - 1] ?? m;
  return short ? `${label} ’${y.slice(2)}` : `${label} ${y}`;
}

export function monthName(index0: number): string {
  return MONTHS[index0] ?? "";
}

export function formatPeriod(start: string, end: string): string {
  return `${formatMonth(start)} – ${formatMonth(end)}`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatSigned(value: number, digits = 1, suffix = ""): string {
  const s = formatNumber(Math.abs(value), digits);
  if (Math.abs(value) < Math.pow(10, -digits) / 2) return `±0${suffix}`;
  return `${value > 0 ? "+" : "−"}${s}${suffix}`;
}

export function formatCoord(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${la}, ${lo}`;
}

export function formatArea(km2: number): string {
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(2)}M km²`;
  if (km2 >= 1_000) return `${Math.round(km2 / 1_000).toLocaleString("en-US")}k km²`;
  return `${Math.round(km2).toLocaleString("en-US")} km²`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
