import { monthName } from "@/shared/lib";
import type { PlannedSeason, RotationStrategy, RotationStrategyId } from "./compare-strategies";

/**
 * Farmer-facing wording for `RotationStrategy` objects, shared by the on-screen comparison and
 * the PDF report so both always say the same thing. Presentation only: it reads the metrics
 * `compareStrategies()` already computed and never re-ranks or re-scores anything.
 */

/** One-line purpose of each strategy (not part of the data contract: it's fixed UI copy). */
export const STRATEGY_PURPOSE: Record<RotationStrategyId, string> = {
  current: "Keep growing what you grow now. The baseline to compare the others with.",
  water: "Crops that need less water, for dry seasons or limited irrigation.",
  soil: "Legumes, deep roots and crop residue to rebuild nitrogen and soil structure.",
};

export const CONFIDENCE_LABEL: Record<RotationStrategy["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/** The contract's reason starts with the level ("Medium: soil type not given."); drop it next to a label that already says it. */
export function confidenceExplanation(s: Pick<RotationStrategy, "confidenceReason">): string {
  const rest = s.confidenceReason.replace(/^(high|medium|low)\s*[:—–-]\s*/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export interface SeasonWindow {
  plant: string;
  harvest: string;
  /** 1 = the plan's first calendar year, 2 = the next one, … */
  year: number;
}

export function seasonWindow(s: PlannedSeason): SeasonWindow {
  return { plant: monthName(s.plantMonth - 1), harvest: monthName(s.harvestMonth - 1), year: Math.floor(s.startOffset / 12) + 1 };
}

const seasonLength = (s: Pick<PlannedSeason, "plantMonth" | "harvestMonth">) => ((s.harvestMonth - s.plantMonth + 12) % 12) + 1;

/** Calendar months (1–12) the crop is in the ground, planting to harvest; wraps over New Year (Nov → Feb = 11, 12, 1, 2). */
export function monthsInGround(s: Pick<PlannedSeason, "plantMonth" | "harvestMonth">): number[] {
  return Array.from({ length: seasonLength(s) }, (_, k) => ((s.plantMonth - 1 + k) % 12) + 1);
}

/** Months the field stands bare between season `i` and the next one (0 for the last season). */
export function bareMonthsAfter(seasons: PlannedSeason[], i: number): number {
  const next = seasons[i + 1];
  if (!next) return 0;
  return Math.max(0, next.startOffset - (seasons[i].startOffset + seasonLength(seasons[i])));
}

/** good / watch / concern drive the colour of a comparison cell; thresholds are display tiers only. */
export type Signal = "good" | "watch" | "concern" | "unknown";

export interface ComparisonCell {
  signal: Signal;
  /** Two or three words, e.g. "Low use". */
  label: string;
  /** One short line explaining the label. */
  detail: string;
}

export type CriterionId = "water" | "nitrogen" | "pests" | "climate" | "bare" | "risks";

export interface ComparisonRow {
  id: CriterionId;
  criterion: string;
  /** What the criterion means, in plain words. */
  hint: string;
  /** One cell per strategy, in the order given; null when that strategy isn't available. */
  cells: Array<ComparisonCell | null>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const WATER_CELL: Record<RotationStrategy["metrics"]["water"], ComparisonCell> = {
  low: { signal: "good", label: "Low use", detail: "Crops need little water" },
  medium: { signal: "watch", label: "Medium use", detail: "Moderate water need" },
  high: { signal: "concern", label: "High use", detail: "Thirsty crops: plan irrigation" },
  unknown: { signal: "unknown", label: "Unknown", detail: "Crop water need not known" },
};

const CRITERIA: Array<{ id: CriterionId; criterion: string; hint: string; cell: (s: RotationStrategy) => ComparisonCell }> = [
  {
    id: "water",
    criterion: "Water",
    hint: "How much water the crops need",
    cell: ({ metrics }) => WATER_CELL[metrics.water],
  },
  {
    id: "nitrogen",
    criterion: "Nitrogen",
    hint: "Legumes feed the soil with nitrogen",
    cell: (s) => {
      const legumes = [...new Set(s.seasons.filter((x) => x.family === "Fabaceae").map((x) => x.cropName))];
      return s.metrics.legumeSeasons > 0
        ? { signal: "good", label: "Adds nitrogen", detail: `Legume in ${plural(s.metrics.legumeSeasons, "season")}${legumes.length ? ` (${legumes.join(", ")})` : ""}` }
        : { signal: "watch", label: "No legume", detail: "All nitrogen comes from fertiliser" };
    },
  },
  {
    id: "pests",
    criterion: "Pest-cycle break",
    hint: "Changing crop family stops pests building up",
    cell: ({ metrics: { familyRepeats: n } }) =>
      n === 0
        ? { signal: "good", label: "Strong break", detail: "Crop family changes every season" }
        : { signal: n === 1 ? "watch" : "concern", label: n === 1 ? "Weak break" : "No break", detail: `Same family back to back ${n === 1 ? "once" : `${n} times`}` },
  },
  {
    id: "climate",
    criterion: "Climate fit",
    hint: "Seasons in the crop's ideal temperature range",
    cell: (s) => {
      const total = s.seasons.length;
      const fit = s.metrics.climateFitSeasons;
      if (total === 0) return { signal: "unknown", label: "Unknown", detail: "No seasons planned" };
      const off = total - fit;
      return {
        signal: off === 0 ? "good" : fit * 2 >= total ? "watch" : "concern",
        label: `${fit} of ${total} seasons`,
        detail: off === 0 ? "All in the ideal range" : `${plural(off, "season")} outside the ideal range`,
      };
    },
  },
  {
    id: "bare",
    criterion: "Bare months",
    hint: "Months with no crop between harvest and the next planting",
    cell: ({ metrics: { bareMonths: n } }) => ({
      signal: n <= 1 ? "good" : n <= 3 ? "watch" : "concern",
      label: plural(n, "month"),
      detail: n === 0 ? "Field is always covered" : n <= 1 ? "Field is almost always covered" : "Soil is exposed: consider a cover crop",
    }),
  },
  {
    id: "risks",
    criterion: "Risks",
    hint: "Warnings from the climate and soil checks",
    cell: ({ metrics: { riskFlags } }) => {
      const n = riskFlags.length;
      return n === 0
        ? { signal: "good", label: "None flagged", detail: "No warnings from the checks" }
        : { signal: n <= 2 ? "watch" : "concern", label: plural(n, "risk"), detail: riskFlags.join("; ") };
    },
  },
];

/** The six-row comparison (Water, Nitrogen, Pest-cycle break, Climate fit, Bare months, Risks). */
export function comparisonRows(strategies: RotationStrategy[]): ComparisonRow[] {
  return CRITERIA.map(({ id, criterion, hint, cell }) => ({
    id,
    criterion,
    hint,
    cells: strategies.map((s) => (s.available ? cell(s) : null)),
  }));
}
