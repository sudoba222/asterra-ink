import { describe, expect, it } from "vitest";
import { SMAP_SOURCE, smapEvidence } from "./smap-evidence";

describe("smapEvidence", () => {
  it("says drier, wetter or about the same as a year ago (10 % rule)", () => {
    expect(smapEvidence({ value: 0.18, date: "2026-11-10" }, { value: 0.24, date: "2025-11-10" })[0].text).toBe(
      "Root-zone soil moisture on Nov 10, 2026: 0.18 m³/m³, 25 % drier than 0.24 on Nov 10, 2025. Crops that need less water are safer this season.",
    );
    expect(smapEvidence({ value: 0.3, date: null }, { value: 0.25, date: null })[0].text).toMatch(/now: 0\.30 m³\/m³, 20 % wetter than 0\.25/);
    expect(smapEvidence({ value: 0.2, date: null }, { value: 0.21, date: null })[0].text).toMatch(/about the same as 0\.21/);
  });
  it("works without last year and returns nothing without data", () => {
    expect(smapEvidence({ value: 0.2, date: "2026-11-10" }, null)).toEqual([{ text: "Root-zone soil moisture on Nov 10, 2026: 0.20 m³/m³.", source: SMAP_SOURCE }]);
    expect(smapEvidence(null, null)).toEqual([]);
  });
});
