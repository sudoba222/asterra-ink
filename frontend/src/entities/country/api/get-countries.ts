import "server-only";
import worldCountries from "world-countries";
import type { Country } from "../model/types";

/**
 * Slim, sorted country list built on the server from the `world-countries`
 * dataset (ODbL). Only the fields the UI needs are sent to the client.
 * Antarctica is excluded (no agricultural use case).
 */
export function getCountries(): Country[] {
  return worldCountries
    .filter((c) => c.cca3 !== "ATA" && c.latlng?.length === 2)
    .map((c) => ({
      iso3: c.cca3,
      iso2: c.cca2,
      name: c.name.common,
      officialName: c.name.official,
      region: c.region,
      subregion: c.subregion,
      capital: c.capital?.[0] ?? null,
      latlng: [c.latlng[0], c.latlng[1]] as [number, number],
      areaKm2: c.area,
      landlocked: c.landlocked,
      search: [
        c.name.common,
        c.name.official,
        c.cca2,
        c.cca3,
        ...(c.altSpellings ?? []),
        ...Object.values(c.name.native ?? {}).map((n) => n.common),
      ]
        .join(" | ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCountryCodes(): string[] {
  return getCountries().map((c) => c.iso3);
}
