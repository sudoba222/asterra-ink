/** "District, City, Region" — whatever parts are known, most specific first, without repeats. */
export function placeLabel(p: { districtName?: string | null; cityName?: string | null; regionName?: string | null }): string {
  const parts = [p.districtName, p.cityName, p.regionName].filter((s): s is string => Boolean(s && s.trim()));
  return parts.filter((s, i) => parts.indexOf(s) === i).join(", ");
}
