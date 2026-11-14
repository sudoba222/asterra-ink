import { describe, expect, it } from "vitest";
import { placeLabel } from "./place";

describe("placeLabel", () => {
  it("joins the known parts, most specific first", () => {
    expect(placeLabel({ districtName: "Zangiota", cityName: "Tashkent", regionName: "Tashkent Region" })).toBe("Zangiota, Tashkent, Tashkent Region");
  });
  it("skips missing parts and duplicates (fields saved before cities existed)", () => {
    expect(placeLabel({ districtName: null, regionName: "Fergana" })).toBe("Fergana");
    expect(placeLabel({ cityName: "Bukhara", regionName: "Bukhara" })).toBe("Bukhara");
    expect(placeLabel({})).toBe("");
  });
});
