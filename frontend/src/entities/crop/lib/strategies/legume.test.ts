import { describe, expect, it } from "vitest";
import { strategyInput } from "../__fixtures__/strategy-input";
import { LEGUME_RANGE, legumeStrategy } from "./legume";

const run = (crop: string, history: [string?, string?]) => legumeStrategy(strategyInput(crop, history));

describe("legume strategy", () => {
  it("rewards a nitrogen-demanding crop that follows a legume", () => {
    const r = run("maize", ["soybean", "wheat"]);
    expect(r.points).toBe(1);
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].text).toMatch(/legume in the previous season \(soybean\) can improve soil nitrogen availability/);
  });

  it("treats history-only legumes (peas, beans, lentils) as legumes", () => {
    for (const legume of ["peas", "beans", "lentils", "alfalfa", "chickpea"]) {
      expect(run("wheat", [legume]).points).toBe(1);
    }
  });

  it("keeps the legacy legume-after-cereal rule and wording", () => {
    const r = run("chickpea", ["wheat"]);
    expect(r.points).toBe(1);
    expect(r.checks).toEqual([{ kind: "pass", rule: "Nutrients", text: "Legume after a cereal — fixes nitrogen for the next crop." }]);
  });

  it("extends the benefit to non-cereal heavy feeders and to two depleting seasons", () => {
    expect(run("soybean", ["cotton"]).points).toBe(1);
    const r = run("soybean", ["wheat", "tomato"]);
    expect(r.points).toBe(2);
    expect(r.checks[1].text).toMatch(/last two seasons \(tomatoes, then wheat\) were both nitrogen-demanding/);
  });

  it("discourages a legume straight after another legume", () => {
    const r = run("chickpea", ["soybean"]);
    expect(r.points).toBe(-1);
    expect(r.checks[0].kind).toBe("note");
  });

  it("does not credit legumes after a neutral crop or fallow, nor neutral crops after legumes", () => {
    expect(run("soybean", ["sunflower"]).points).toBe(0);
    expect(run("soybean", ["fallow"]).points).toBe(0);
    expect(run("sunflower", ["soybean"]).points).toBe(0);
    expect(run("sunflower", ["soybean"]).checks).toEqual([]);
  });

  it("is not applicable without last season's crop", () => {
    const r = run("maize", []);
    expect(r).toMatchObject({ applicable: false, points: 0, checks: [] });
  });

  it("stays inside its documented range", () => {
    const crops = ["maize", "wheat", "soybean", "chickpea", "alfalfa", "sunflower", "cotton", "potato"];
    const hist = ["maize", "soybean", "peas", "cotton", "fallow", "vegetables", "rice"];
    for (const c of crops) for (const a of hist) for (const b of hist) {
      const p = run(c, [a, b]).points;
      expect(p).toBeGreaterThanOrEqual(LEGUME_RANGE.min);
      expect(p).toBeLessThanOrEqual(LEGUME_RANGE.max);
    }
  });
});
