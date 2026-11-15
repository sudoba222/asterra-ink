import { monthName } from "@/shared/lib";
import { HISTORY_OPTIONS } from "./catalog";

/** Answers from the short farmer questionnaire. Every field supports "unknown". */
export interface FarmerProfile {
  /** [last season, season before] — crop id, "unknown" or "" (not answered). */
  previousCrops: [string, string];
  irrigation: "rainfed" | "irrigated" | "both" | "unknown";
  /** 1–12, or null when unknown. */
  plantingMonth: number | null;
  goal: "profit" | "yield" | "water" | "soil" | "risk";
  issues: FieldIssue[];
  issueDetail: string;
  soilType: "unknown" | "sandy" | "loam" | "clay";
  budget: "unknown" | "low" | "medium" | "high";
}

export type FieldIssue = "pests" | "disease" | "poor-yield" | "salinity" | "waterlogging" | "erosion";

export const EMPTY_PROFILE: FarmerProfile = {
  previousCrops: ["", ""],
  irrigation: "unknown",
  plantingMonth: null,
  goal: "yield",
  issues: [],
  issueDetail: "",
  soilType: "unknown",
  budget: "unknown",
};

type Option<T extends string> = { value: T; label: string };

export const GOAL_OPTIONS: Array<Option<FarmerProfile["goal"]>> = [
  { value: "yield", label: "Higher yield" },
  { value: "profit", label: "Profit" },
  { value: "water", label: "Save water" },
  { value: "soil", label: "Soil health" },
  { value: "risk", label: "Lower risk" },
];

export const IRRIGATION_OPTIONS: Array<Option<FarmerProfile["irrigation"]>> = [
  { value: "rainfed", label: "Rain only" },
  { value: "irrigated", label: "Irrigated" },
  { value: "both", label: "Both" },
  { value: "unknown", label: "Not sure" },
];

export const ISSUE_OPTIONS: Array<Option<FieldIssue>> = [
  { value: "pests", label: "Pests" },
  { value: "disease", label: "Disease" },
  { value: "poor-yield", label: "Poor yields" },
  { value: "salinity", label: "Salty soil" },
  { value: "waterlogging", label: "Waterlogging" },
  { value: "erosion", label: "Erosion" },
];

export const SOIL_OPTIONS: Array<Option<FarmerProfile["soilType"]>> = [
  { value: "unknown", label: "Don’t know" },
  { value: "sandy", label: "Sandy" },
  { value: "loam", label: "Loam" },
  { value: "clay", label: "Clay" },
];

export const BUDGET_OPTIONS: Array<Option<FarmerProfile["budget"]>> = [
  { value: "unknown", label: "Skip" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const NOT_ANSWERED = "Not answered";

function labelOf<T extends string>(options: Array<Option<T>>, value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function previousCropLabel(id: string): string {
  if (!id) return NOT_ANSWERED;
  if (id === "unknown") return "Don’t know";
  return HISTORY_OPTIONS.find((o) => o.id === id)?.name ?? id;
}

/** The farmer's answers as plain label/value rows, worded like the questionnaire (used by the PDF report). */
export function describeProfile(p: FarmerProfile): Array<{ label: string; value: string }> {
  const issues = p.issues.map((i) => labelOf(ISSUE_OPTIONS, i)).join(", ");
  const detail = p.issueDetail.trim();
  return [
    { label: "Last season", value: previousCropLabel(p.previousCrops[0]) },
    { label: "Season before", value: previousCropLabel(p.previousCrops[1]) },
    { label: "Watering", value: labelOf(IRRIGATION_OPTIONS, p.irrigation) },
    { label: "Planting month", value: p.plantingMonth ? monthName(p.plantingMonth - 1) : "Not decided yet" },
    { label: "Main goal", value: labelOf(GOAL_OPTIONS, p.goal) },
    { label: "Field problems", value: issues ? (detail ? `${issues} (${detail})` : issues) : "None reported" },
    { label: "Soil type", value: p.soilType === "unknown" ? "Don’t know" : labelOf(SOIL_OPTIONS, p.soilType) },
    { label: "Budget", value: p.budget === "unknown" ? NOT_ANSWERED : labelOf(BUDGET_OPTIONS, p.budget) },
  ];
}
