import { describe, expect, it } from "vitest";
import { countryCandidates, type CountryIndexEntry } from "./country-at";

const index: CountryIndexEntry[] = [
  { iso3: "ZAF", boxes: [[16.4, -34.9, 32.9, -22.1]] },
  { iso3: "LSO", boxes: [[27.0, -30.7, 29.5, -28.5]] }, // enclave inside South Africa's box
  { iso3: "FJI", boxes: [[177.0, -19.2, 180, -16.0], [-180, -17.0, -178.0, -15.9]] }, // split at the antimeridian
];

describe("countryCandidates", () => {
  it("returns nothing over open sea", () => {
    expect(countryCandidates(index, 0, 0)).toEqual([]);
  });

  it("tries the smaller box first so enclaves win over their host", () => {
    expect(countryCandidates(index, 28.2, -29.6)).toEqual(["LSO", "ZAF"]);
  });

  it("matches polygons on both sides of the antimeridian", () => {
    expect(countryCandidates(index, 178.4, -18.1)).toEqual(["FJI"]);
    expect(countryCandidates(index, -179.5, -16.5)).toEqual(["FJI"]);
  });
});
