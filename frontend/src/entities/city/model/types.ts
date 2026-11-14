export type { City, CityList } from "@/shared/api/geonames-cities";

/** Attached to each city marker primitive so a globe pick can tell which city was hit. */
export interface CityPickId {
  kind: "city";
  cityId: string;
}

export function isCityPickId(v: unknown): v is CityPickId {
  return typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "city" && typeof (v as { cityId?: unknown }).cityId === "string";
}
