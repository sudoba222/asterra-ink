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
