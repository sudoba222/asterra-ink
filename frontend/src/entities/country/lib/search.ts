import type { Country } from "../model/types";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Ranks: exact code > name prefix > word prefix > anywhere in search terms. */
export function searchCountries(countries: Country[], query: string, region: string | null): Country[] {
  const q = normalize(query);
  const pool = region ? countries.filter((c) => c.region === region) : countries;
  if (!q) return pool;
  const scored: Array<{ c: Country; s: number }> = [];
  for (const c of pool) {
    const name = normalize(c.name);
    let s = -1;
    if (c.iso3.toLowerCase() === q || c.iso2.toLowerCase() === q) s = 100;
    else if (name.startsWith(q)) s = 80;
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) s = 60;
    else if (c.search.includes(q)) s = 30;
    if (s >= 0) scored.push({ c, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name)).map((x) => x.c);
}
