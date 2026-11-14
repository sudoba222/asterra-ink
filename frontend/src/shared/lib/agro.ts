/**
 * FAO-56 helpers (Allen et al., 1998, FAO Irrigation and Drainage Paper 56).
 * https://www.fao.org/4/x0490e/x0490e00.htm
 */

const MID_MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/** Extraterrestrial radiation Ra (MJ m⁻² day⁻¹) for a latitude and month (FAO-56 eq. 21, mid-month day). */
export function extraterrestrialRadiation(latDeg: number, month1to12: number): number {
  return extraterrestrialRadiationDoy(latDeg, MID_MONTH_DOY[month1to12 - 1]);
}

/** Extraterrestrial radiation Ra (MJ m⁻² day⁻¹) for a latitude and day of year (FAO-56 eq. 21). */
export function extraterrestrialRadiationDoy(latDeg: number, J: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * J) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * J) / 365 - 1.39);
  const ws = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta))));
  const Gsc = 0.082;
  return ((24 * 60) / Math.PI) * Gsc * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/**
 * Reference evapotranspiration ET₀ (mm/day) by the Hargreaves equation (FAO-56 eq. 52),
 * from mean temperature and mean daily temperature range (°C).
 */
export function hargreavesEt0(tMean: number, dailyRange: number, latDeg: number, month1to12: number): number {
  const ra = extraterrestrialRadiation(latDeg, month1to12);
  const et0 = 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(0, dailyRange)) * 0.408 * ra;
  return Math.max(0, et0);
}

/** Day of year (1–366) for an ISO date "YYYY-MM-DD" (UTC). */
export function dayOfYear(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/** Daily reference ET₀ (mm/day), FAO-56 Hargreaves (eq. 52) from daily Tmax/Tmin. */
export function hargreavesEt0Daily(tMax: number, tMin: number, latDeg: number, isoDate: string): number {
  const ra = extraterrestrialRadiationDoy(latDeg, dayOfYear(isoDate));
  const tMean = (tMax + tMin) / 2;
  return Math.max(0, 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(0, tMax - tMin)) * 0.408 * ra);
}
