import type { Check, PointRange, StrategyInput, StrategyOutcome } from "../engine-types";

/**
 * Legume-based rotation: owns every nitrogen-sequencing rule, so nitrogen is counted once.
 *
 *  Legume after a cereal (legacy rule)                                  +1
 *  Legume after another nitrogen-demanding crop (cotton, potato, …)     +1
 *  …and the season before was nitrogen-demanding too                    +1
 *  Legume after a legume (fixed nitrogen goes unused)                   −1
 *  Nitrogen-demanding crop after a legume                               +1
 *  Nitrogen-demanding crop after another one (legacy note)               0
 */
export const LEGUME_RANGE: PointRange = { min: -1, max: 2 };

export function legumeStrategy({ crop, history }: StrategyInput): StrategyOutcome {
  const { last, before } = history;
  const checks: Check[] = [];
  let points = 0;

  if (!last) return { id: "legume", points: 0, checks, applicable: false };

  if (crop.nitrogen === "fixes") {
    if (last.family === "Fabaceae") {
      points -= 1;
      checks.push({
        kind: "note",
        rule: "Nitrogen",
        text: `Legume after a legume (${last.name.toLowerCase()}) — a second legume adds little nitrogen; a nitrogen-demanding crop would make better use of what the last one left.`,
      });
    } else if (last.nitrogen === "demanding") {
      points += 1;
      checks.push(
        last.family === "Poaceae"
          ? { kind: "pass", rule: "Nutrients", text: "Legume after a cereal — fixes nitrogen for the next crop." }
          : { kind: "pass", rule: "Nitrogen", text: `Legume after a nitrogen-demanding crop (${last.name.toLowerCase()}) — fixes nitrogen for the next crop.` },
      );
      if (before?.nitrogen === "demanding") {
        points += 1;
        checks.push({
          kind: "pass",
          rule: "Nitrogen",
          text: `Recommended because the last two seasons (${before.name.toLowerCase()}, then ${last.name.toLowerCase()}) were both nitrogen-demanding — a legume now restores soil nitrogen before the next heavy feeder.`,
        });
      }
    }
  }

  if (crop.nitrogen === "demanding" && last.nitrogen === "fixes") {
    points += 1;
    checks.push({
      kind: "pass",
      rule: "Nitrogen",
      text: `Recommended because the legume in the previous season (${last.name.toLowerCase()}) can improve soil nitrogen availability for this nitrogen-demanding crop.`,
    });
  }

  if (crop.nitrogen === "demanding" && last.nitrogen === "demanding" && last.family !== null) {
    checks.push({ kind: "note", rule: "Nutrients", text: "Follows another nitrogen-demanding crop — plan fertilization or a legume next." });
  }

  return { id: "legume", points, checks, applicable: true };
}
