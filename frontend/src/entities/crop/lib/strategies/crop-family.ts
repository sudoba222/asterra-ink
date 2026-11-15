import { FAMILY_ROTATION, type HistoryOption } from "../../model/catalog";
import type { Check, PointRange, StrategyInput, StrategyOutcome } from "../engine-types";

/**
 * Crop-family rotation: owns every botanical-family rule, so repetition is counted once.
 *
 *  Different family from last season (legacy)                           +2
 *  Same crop as last season (legacy)                                    −2
 *  Same family as last season after reported pests/disease (legacy)     −3
 *  No crop of this family in either of the last two seasons             +1
 *  Family returns after a single break season (needs ≥ 2)               −1 (−2 with pests/disease)
 *  Third consecutive season of the same family                          −1
 */
export const FAMILY_RANGE: PointRange = { min: -6, max: 3 };

/** A season whose family we know — fallow counts: it hosts no crop family. */
function known(o: HistoryOption | null): o is HistoryOption {
  return o !== null && (o.family !== null || o.id === "fallow");
}

export function cropFamilyStrategy({ crop, history, pestHistory }: StrategyInput): StrategyOutcome {
  const { last, before } = history;
  const checks: Check[] = [];
  let points = 0;
  const lastFamily = last?.family ?? null;
  const beforeFamily = before?.family ?? null;
  const { minBreakSeasons, buildUp } = FAMILY_ROTATION[crop.family];
  const familyLower = crop.familyLabel.toLowerCase();

  if (!known(last)) return { id: "family", points: 0, checks, applicable: false };

  // Legacy last-season rules (texts and points unchanged).
  if (lastFamily) {
    if (last.id === crop.id) {
      points -= 2;
      checks.push({ kind: "warn", rule: "Rotation", text: "Same crop as last season — repeating raises pest, disease and nutrient-depletion risk." });
    }
    if (lastFamily === crop.family) {
      if (pestHistory) {
        points -= 3;
        checks.push({ kind: "warn", rule: "Rotation", text: `Same family (${crop.familyLabel}) as last season after reported pests/disease — many pathogens share hosts within a family.` });
      } else if (last.id !== crop.id) {
        checks.push({ kind: "note", rule: "Rotation", text: `Same family as last season — acceptable without pest history, but a different family breaks pest cycles better.` });
      }
    } else {
      points += 2;
      checks.push({ kind: "pass", rule: "Rotation", text: `Breaks the cycle: ${familyLower} after ${last.name.toLowerCase()}.` });
    }
  }

  // Multi-season rules (need the season before as well).
  if (lastFamily === crop.family && beforeFamily === crop.family) {
    points -= 1;
    checks.push({ kind: "warn", rule: "Crop family", text: `Would be the third season in a row from the ${familyLower} — ${buildUp} build up with each consecutive season.` });
  } else if (lastFamily !== crop.family && beforeFamily === crop.family && minBreakSeasons >= 2) {
    points -= pestHistory ? 2 : 1;
    checks.push({
      kind: pestHistory ? "warn" : "note",
      rule: "Crop family",
      text: `${before!.name} (${familyLower}) was grown two seasons ago — one season of a different crop is shorter than the ~${minBreakSeasons}-season break usually advised against ${buildUp}.`,
    });
  } else if (lastFamily !== crop.family && known(before) && beforeFamily !== crop.family) {
    points += 1;
    checks.push({
      kind: "pass",
      rule: "Crop family",
      text: `Recommended to reduce pest and disease risk: nothing from the ${familyLower} in either of the last two seasons, so ${buildUp} get a longer break.`,
    });
  }

  return { id: "family", points, checks, applicable: true };
}
