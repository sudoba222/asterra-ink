/**
 * ASTERRA crop catalog v0.1 — INDICATIVE.
 *
 * Temperature and rainfall ranges are approximate values summarised from the
 * FAO ECOCROP database (https://gaez.fao.org/pages/ecocrop) and general
 * agronomy references. They are used only as coarse filters and have NOT been
 * verified by the team's agronomy workstream (`verified: false`). Salinity
 * classes follow FAO Irrigation & Drainage Paper 29 groupings.
 */
export const CATALOG_VERSION = "0.1.0";

export type CropFamily = "Poaceae" | "Fabaceae" | "Asteraceae" | "Solanaceae" | "Malvaceae";

export interface Range4 {
  absMin: number;
  optMin: number;
  optMax: number;
  absMax: number;
}

export interface Crop {
  id: string;
  name: string;
  family: CropFamily;
  familyLabel: string;
  /** Typical months from planting to harvest. */
  seasonMonths: number;
  /** Mean air temperature over the growing season, °C. */
  temperature: Range4;
  /** Annual rainfall, mm. */
  rainfall: Range4;
  waterNeed: "low" | "medium" | "high";
  nitrogen: "fixes" | "neutral" | "demanding";
  frostTolerant: boolean;
  drainageSensitive: boolean;
  salinity: "sensitive" | "moderate" | "tolerant";
  verified: false;
}

const families: Record<CropFamily, string> = {
  Poaceae: "Cereals (grass family)",
  Fabaceae: "Legumes",
  Asteraceae: "Sunflower family",
  Solanaceae: "Nightshade family",
  Malvaceae: "Mallow family",
};

function crop(c: Omit<Crop, "familyLabel" | "verified">): Crop {
  return { ...c, familyLabel: families[c.family], verified: false };
}

export const CROPS: Crop[] = [
  crop({ id: "maize", name: "Maize (corn)", family: "Poaceae", seasonMonths: 4, temperature: { absMin: 10, optMin: 18, optMax: 33, absMax: 47 }, rainfall: { absMin: 400, optMin: 600, optMax: 1200, absMax: 1800 }, waterNeed: "high", nitrogen: "demanding", frostTolerant: false, drainageSensitive: false, salinity: "sensitive" }),
  crop({ id: "wheat", name: "Wheat", family: "Poaceae", seasonMonths: 5, temperature: { absMin: 5, optMin: 15, optMax: 23, absMax: 27 }, rainfall: { absMin: 300, optMin: 750, optMax: 900, absMax: 1600 }, waterNeed: "medium", nitrogen: "demanding", frostTolerant: true, drainageSensitive: false, salinity: "moderate" }),
  crop({ id: "barley", name: "Barley", family: "Poaceae", seasonMonths: 4, temperature: { absMin: 2, optMin: 15, optMax: 20, absMax: 40 }, rainfall: { absMin: 200, optMin: 500, optMax: 1000, absMax: 2000 }, waterNeed: "low", nitrogen: "demanding", frostTolerant: true, drainageSensitive: false, salinity: "tolerant" }),
  crop({ id: "sorghum", name: "Sorghum", family: "Poaceae", seasonMonths: 4, temperature: { absMin: 8, optMin: 27, optMax: 35, absMax: 40 }, rainfall: { absMin: 300, optMin: 500, optMax: 1000, absMax: 3000 }, waterNeed: "low", nitrogen: "demanding", frostTolerant: false, drainageSensitive: false, salinity: "moderate" }),
  crop({ id: "soybean", name: "Soybean", family: "Fabaceae", seasonMonths: 4, temperature: { absMin: 10, optMin: 20, optMax: 33, absMax: 38 }, rainfall: { absMin: 450, optMin: 600, optMax: 1500, absMax: 1800 }, waterNeed: "medium", nitrogen: "fixes", frostTolerant: false, drainageSensitive: false, salinity: "moderate" }),
  crop({ id: "chickpea", name: "Chickpea", family: "Fabaceae", seasonMonths: 4, temperature: { absMin: 7, optMin: 15, optMax: 29, absMax: 35 }, rainfall: { absMin: 300, optMin: 600, optMax: 1000, absMax: 1800 }, waterNeed: "low", nitrogen: "fixes", frostTolerant: false, drainageSensitive: true, salinity: "sensitive" }),
  crop({ id: "alfalfa", name: "Alfalfa (lucerne)", family: "Fabaceae", seasonMonths: 6, temperature: { absMin: 5, optMin: 15, optMax: 25, absMax: 35 }, rainfall: { absMin: 350, optMin: 600, optMax: 1200, absMax: 2700 }, waterNeed: "high", nitrogen: "fixes", frostTolerant: true, drainageSensitive: true, salinity: "sensitive" }),
  crop({ id: "sunflower", name: "Sunflower", family: "Asteraceae", seasonMonths: 4, temperature: { absMin: 6, optMin: 17, optMax: 33, absMax: 38 }, rainfall: { absMin: 400, optMin: 600, optMax: 1000, absMax: 1500 }, waterNeed: "low", nitrogen: "neutral", frostTolerant: false, drainageSensitive: true, salinity: "moderate" }),
  crop({ id: "cotton", name: "Cotton", family: "Malvaceae", seasonMonths: 6, temperature: { absMin: 15, optMin: 20, optMax: 30, absMax: 38 }, rainfall: { absMin: 500, optMin: 700, optMax: 1500, absMax: 4000 }, waterNeed: "high", nitrogen: "demanding", frostTolerant: false, drainageSensitive: false, salinity: "tolerant" }),
  crop({ id: "potato", name: "Potato", family: "Solanaceae", seasonMonths: 4, temperature: { absMin: 7, optMin: 15, optMax: 25, absMax: 30 }, rainfall: { absMin: 250, optMin: 500, optMax: 800, absMax: 2000 }, waterNeed: "medium", nitrogen: "demanding", frostTolerant: false, drainageSensitive: true, salinity: "sensitive" }),
];

/**
 * Rotation interval per botanical family — INDICATIVE, general agronomy guidance
 * (extension-service rotation tables), not verified by the agronomy workstream.
 * `minBreakSeasons` = seasons of a *different* family usually recommended before the
 * same family returns. `buildUp` names the well-known soil-borne problems behind it.
 */
export const FAMILY_ROTATION: Record<CropFamily, { minBreakSeasons: number; buildUp: string }> = {
  Poaceae: { minBreakSeasons: 1, buildUp: "take-all and other cereal root diseases" },
  Fabaceae: { minBreakSeasons: 3, buildUp: "legume root rots (e.g. Fusarium, Aphanomyces)" },
  Solanaceae: { minBreakSeasons: 3, buildUp: "late blight, cyst nematodes and other nightshade pests" },
  Asteraceae: { minBreakSeasons: 3, buildUp: "Sclerotinia white mould and downy mildew" },
  Malvaceae: { minBreakSeasons: 2, buildUp: "Verticillium wilt and root-knot nematodes" },
};

export interface HistoryOption {
  id: string;
  name: string;
  family: CropFamily | null;
  /** null when unknown (mixed vegetables, other) or not a crop (fallow). */
  nitrogen: Crop["nitrogen"] | null;
  waterNeed: Crop["waterNeed"] | null;
}

/**
 * Crops a farmer can report as previous seasons (catalog + common extras). The extras are
 * history-only: they have no ECOCROP ranges here, so they are never recommended.
 * Water-need classes for extras are indicative (FAO crop water information).
 */
export const HISTORY_OPTIONS: HistoryOption[] = [
  ...CROPS.map((c) => ({ id: c.id, name: c.name, family: c.family as CropFamily | null, nitrogen: c.nitrogen, waterNeed: c.waterNeed })),
  { id: "rice", name: "Rice", family: "Poaceae", nitrogen: "demanding", waterNeed: "high" },
  { id: "peas", name: "Peas", family: "Fabaceae", nitrogen: "fixes", waterNeed: "medium" },
  { id: "beans", name: "Beans", family: "Fabaceae", nitrogen: "fixes", waterNeed: "medium" },
  { id: "lentils", name: "Lentils", family: "Fabaceae", nitrogen: "fixes", waterNeed: "low" },
  { id: "tomato", name: "Tomatoes", family: "Solanaceae", nitrogen: "demanding", waterNeed: "medium" },
  { id: "vegetables", name: "Vegetables (mixed)", family: null, nitrogen: null, waterNeed: null },
  { id: "fallow", name: "Fallow / nothing", family: null, nitrogen: null, waterNeed: null },
  { id: "other", name: "Other crop", family: null, nitrogen: null, waterNeed: null },
];

export function cropById(id: string) {
  return CROPS.find((c) => c.id === id) ?? null;
}

export function historyFamily(id: string): CropFamily | null {
  return HISTORY_OPTIONS.find((o) => o.id === id)?.family ?? null;
}

export function historyOption(id: string): HistoryOption | null {
  return HISTORY_OPTIONS.find((o) => o.id === id) ?? null;
}
