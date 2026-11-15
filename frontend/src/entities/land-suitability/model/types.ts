/**
 * Result of checking whether a field polygon is land that can be farmed at all.
 * It runs BEFORE the crop recommendation engine and is based only on land-cover and
 * map geometry — never on climate.
 */

/** `uncertain` = the data could not confirm either way; it never blocks recommendations on its own. */
export type LandStatus = "suitable" | "unsuitable_land" | "uncertain";

export type UnsuitableReason =
  | "building_detected"
  | "water_detected"
  | "infrastructure_detected"
  | "built_up_area_detected"
  | "non_agricultural_land_use";

export type UncertainReason = "land_cover_unavailable" | "sources_disagree" | "mixed_land_cover";

export type LandReason = UnsuitableReason | UncertainReason;

/** Land that rules out cultivation. Forest, grassland, bare land and wetland are NOT in this list. */
export type BlockingClass = "building" | "water" | "infrastructure" | "nonAgricultural";

/** Share of the field (0–1) that a source sees as each blocking class. */
export type BlockingShares = Record<BlockingClass, number>;

/** OpenStreetMap geometry measured inside the polygon. */
export interface OsmCoverage {
  shares: BlockingShares;
  /** Share covered by at least one blocking class (classes can overlap, e.g. a building on industrial land). */
  blocked: number;
  /** Share inside residential land use (household plots are farmed, so this only adds a note). */
  residential: number;
  /** Most common non-agricultural land-use value inside the field, e.g. "industrial". */
  landUse: string | null;
  /** Grid points used to measure the polygon and their spacing. */
  samples: number;
  spacingM: number;
  /** Mapped features that touch the field. */
  features: number;
}

/** ESA WorldCover classes by name (v200, 2021). */
export type WorldCoverClass =
  | "tree"
  | "shrubland"
  | "grassland"
  | "cropland"
  | "builtUp"
  | "bare"
  | "snowIce"
  | "water"
  | "wetland"
  | "mangroves"
  | "moss";

/** ESA WorldCover pixels inside the polygon. */
export interface WorldCoverSample {
  /** Share of valid pixels per class (0–1). */
  shares: Record<WorldCoverClass, number>;
  pixels: number;
  resolutionM: number;
  /** The field is smaller than one pixel, so the pixel under its centre was used. */
  smallerThanPixel: boolean;
}

export interface LandSourceStatus {
  id: "esa-worldcover" | "osm";
  name: string;
  ok: boolean;
  detail: string;
  url: string | null;
}

export interface LandSuitability {
  status: LandStatus;
  /** null when status is "suitable". */
  reason: LandReason | null;
  /** Farmer-facing sentence. For "unsuitable_land" it starts with "Crop recommendations are unavailable." */
  message: string;
  /** Plain facts behind the decision (shares and which source saw them). */
  evidence: string[];
  /** Non-blocking notes, e.g. part of the field is a building. */
  warnings: string[];
  osm: OsmCoverage | null;
  worldCover: WorldCoverSample | null;
  sources: LandSourceStatus[];
  checkedAt: string;
}
