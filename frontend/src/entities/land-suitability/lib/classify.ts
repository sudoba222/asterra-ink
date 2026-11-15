import type {
  BlockingClass,
  WorldCoverClass,
  LandReason,
  LandStatus,
  OsmCoverage,
  UnsuitableReason,
  WorldCoverSample,
} from "../model/types";

/**
 * Transparent rules deciding whether a polygon is farmable land. Inputs are land-cover
 * measurements only (no climate). Thresholds are shares of the field's area.
 */
export const LAND_RULES = {
  /** Mapped OSM geometry (buildings, water, roads, non-farm land use) covering at least this share → unsuitable. */
  osmUnsuitable: 0.5,
  /** WorldCover alone (10 m satellite land cover) at or above this share → unsuitable, unless OSM contradicts it. */
  worldCoverUnsuitable: 0.7,
  /** Both sources agree: OSM ≥ this share AND WorldCover ≥ `worldCoverMixed`. */
  osmCorroborating: 0.3,
  /** WorldCover share that is too high to call the land clear, but too low to call it unsuitable alone. */
  worldCoverMixed: 0.5,
  /** OSM below this share while WorldCover sees built-up land → the sources disagree. */
  osmContradicts: 0.1,
  /**
   * WorldCover cropland at or above this share (a) contradicts a non-farm OSM land-use polygon and
   * (b) is required to confirm the land when OSM is unavailable, because 10 m pixels miss narrow
   * roads, small buildings and streets under tree canopy.
   */
  worldCoverCropland: 0.5,
  /** Partial coverage at or above this share is reported as a note. */
  partial: 0.1,
} as const;

export interface LandInput {
  osm: OsmCoverage | null;
  worldCover: WorldCoverSample | null;
}

export interface LandDecision {
  status: LandStatus;
  reason: LandReason | null;
  message: string;
  evidence: string[];
  warnings: string[];
}

const pct = (v: number) => (v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);

const LAND_USE_LABEL: Record<string, string> = {
  industrial: "industrial land",
  commercial: "commercial land",
  retail: "retail land",
  construction: "a construction site",
  military: "military land",
  cemetery: "a cemetery",
  landfill: "a landfill",
  quarry: "a quarry",
  garages: "garages",
  brownfield: "former industrial land",
  depot: "a depot",
  port: "a port",
  glacier: "a glacier",
};

const UNAVAILABLE = "Crop recommendations are unavailable.";

export function unsuitableMessage(reason: UnsuitableReason, landUse?: string | null): string {
  switch (reason) {
    case "building_detected":
      return `${UNAVAILABLE} The selected area contains a building and is not suitable for agricultural cultivation.`;
    case "water_detected":
      return `${UNAVAILABLE} The selected area is covered by water.`;
    case "infrastructure_detected":
      return `${UNAVAILABLE} The selected area is covered by infrastructure and cannot be used for agricultural cultivation.`;
    case "built_up_area_detected":
      return `${UNAVAILABLE} Satellite land-cover data shows the selected area is built-up land (buildings and paved surfaces) and is not suitable for agricultural cultivation.`;
    case "non_agricultural_land_use":
      if (landUse === "snowIce") return `${UNAVAILABLE} The selected area is covered by permanent snow or ice.`;
      return `${UNAVAILABLE} The selected area is mapped as ${LAND_USE_LABEL[landUse ?? ""] ?? "non-agricultural land"} and is not suitable for agricultural cultivation.`;
  }
}

const OSM_REASON: Record<BlockingClass, UnsuitableReason> = {
  building: "building_detected",
  water: "water_detected",
  infrastructure: "infrastructure_detected",
  nonAgricultural: "non_agricultural_land_use",
};

const CLASS_LABEL: Record<BlockingClass, string> = {
  building: "buildings",
  water: "water",
  infrastructure: "roads and paved surfaces",
  nonAgricultural: "non-agricultural land use",
};

/** Ties go to the more certain, more specific class. */
const PRIORITY: BlockingClass[] = ["water", "building", "infrastructure", "nonAgricultural"];

function dominant(shares: Record<BlockingClass, number>): BlockingClass {
  return PRIORITY.reduce((best, c) => (shares[c] > shares[best] ? c : best), PRIORITY[0]);
}

/** WorldCover in the same four buckets (it cannot tell buildings from roads: both are "built-up"). */
function worldCoverBlocking(wc: WorldCoverSample) {
  return { builtUp: wc.shares.builtUp, water: wc.shares.water, snowIce: wc.shares.snowIce, total: wc.shares.builtUp + wc.shares.water + wc.shares.snowIce };
}

const WORLDCOVER_LABEL: Record<WorldCoverClass, string> = {
  tree: "trees",
  shrubland: "shrubland",
  grassland: "grassland",
  cropland: "cropland",
  builtUp: "built-up",
  bare: "bare or sparse vegetation",
  snowIce: "snow and ice",
  water: "water",
  wetland: "wetland",
  mangroves: "mangroves",
  moss: "moss and lichen",
};

function osmEvidence(osm: OsmCoverage): string[] {
  const out = PRIORITY.filter((c) => osm.shares[c] > 0).map((c) => `OpenStreetMap: ${CLASS_LABEL[c]} on ${pct(osm.shares[c])} of the field`);
  return out.length ? out : ["OpenStreetMap: no buildings, water, roads or non-farm land use mapped inside the field"];
}

function worldCoverEvidence(wc: WorldCoverSample): string[] {
  // Main classes (≥ 5%) plus any land cover that rules out farming, largest first.
  const parts = (Object.entries(wc.shares) as Array<[WorldCoverClass, number]>)
    .filter(([c, v]) => v >= 0.05 || (v > 0 && (c === "builtUp" || c === "water" || c === "snowIce")))
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `${WORLDCOVER_LABEL[c]} ${pct(v)}`);
  const size = wc.smallerThanPixel ? "field smaller than one 10 m pixel, centre pixel used" : `${wc.pixels} pixels at ${wc.resolutionM} m`;
  return [`ESA WorldCover 2021 satellite land cover: ${parts.join(", ")} (${size})`];
}

function partialWarnings(osm: OsmCoverage | null, wc: WorldCoverSample | null): string[] {
  const warnings: string[] = [];
  if (osm) {
    for (const c of PRIORITY) {
      if (osm.shares[c] >= LAND_RULES.partial) warnings.push(`About ${pct(osm.shares[c])} of the field is ${CLASS_LABEL[c]} on the map. The crop advice applies only to the open, farmable part.`);
    }
    if (osm.residential >= LAND_RULES.osmUnsuitable && osm.blocked < LAND_RULES.partial) {
      warnings.push("The field lies in a residential area on the map. That is fine for a household plot; make sure the outline covers only the cultivated ground.");
    }
  }
  if (wc && warnings.length === 0) {
    const b = worldCoverBlocking(wc);
    if (b.total >= LAND_RULES.partial) {
      const what = b.water >= b.builtUp ? "water" : "built-up land";
      warnings.push(`Satellite land cover shows about ${pct(b.total)} of the field as ${what}. Check that the outline covers only the cultivated ground.`);
    }
  }
  return warnings;
}

function unsuitable(reason: UnsuitableReason, evidence: string[], landUse?: string | null): LandDecision {
  return { status: "unsuitable_land", reason, message: unsuitableMessage(reason, landUse), evidence, warnings: [] };
}

function uncertain(reason: Exclude<LandReason, UnsuitableReason>, message: string, evidence: string[], warnings: string[]): LandDecision {
  return { status: "uncertain", reason, message, evidence, warnings };
}

/**
 * Decides from the measured shares. Never returns "unsuitable_land" without a source that
 * actually saw blocking cover; missing or conflicting data gives "uncertain".
 */
export function classifyLand({ osm, worldCover: wc }: LandInput): LandDecision {
  const evidence = [...(osm ? osmEvidence(osm) : []), ...(wc ? worldCoverEvidence(wc) : [])];
  const wcB = wc ? worldCoverBlocking(wc) : null;

  // 1. Mapped geometry covers most of the field.
  if (osm && osm.blocked >= LAND_RULES.osmUnsuitable) {
    const cls = dominant(osm.shares);
    // A non-farm land-use polygon is coarse; if the satellite sees mostly cropland the map may be outdated.
    if (cls === "nonAgricultural" && wc && wc.shares.cropland >= LAND_RULES.worldCoverCropland) {
      return uncertain(
        "sources_disagree",
        `The map marks this area as ${LAND_USE_LABEL[osm.landUse ?? ""] ?? "non-agricultural land"}, but satellite land cover shows cropland. We couldn’t confirm that it can be farmed, so treat the crop advice with care.`,
        evidence,
        [],
      );
    }
    return unsuitable(OSM_REASON[cls], evidence, osm.landUse);
  }

  if (wc && wcB) {
    const strong = wcB.total >= LAND_RULES.worldCoverUnsuitable;
    const corroborated = osm !== null && osm.blocked >= LAND_RULES.osmCorroborating && wcB.total >= LAND_RULES.worldCoverMixed;

    if (strong || corroborated) {
      // 2. Water and permanent snow/ice are reliable satellite classes.
      if (wcB.water >= wcB.builtUp && wcB.water >= wcB.snowIce) return unsuitable("water_detected", evidence);
      if (wcB.snowIce > wcB.builtUp) return unsuitable("non_agricultural_land_use", evidence, "snowIce");
      // 3. Built-up land: OSM that maps the field and finds almost nothing (e.g. greenhouses read as built-up) is a contradiction.
      if (corroborated && osm) return unsuitable(OSM_REASON[dominant(osm.shares)], evidence, osm.landUse);
      if (osm && osm.blocked < LAND_RULES.osmContradicts) {
        return uncertain(
          "sources_disagree",
          "Satellite land cover shows this area as built-up land, but the map shows no buildings or roads here. We couldn’t confirm that it can be farmed, so treat the crop advice with care.",
          evidence,
          [],
        );
      }
      return unsuitable("built_up_area_detected", evidence);
    }

    if (wcB.total >= LAND_RULES.worldCoverMixed) {
      return uncertain(
        "mixed_land_cover",
        `Satellite land cover shows about ${pct(wcB.total)} of this area as ${wcB.water >= wcB.builtUp ? "water" : "built-up land"}. We couldn’t confirm that it can be farmed, so treat the crop advice with care.`,
        evidence,
        partialWarnings(osm, wc),
      );
    }
  }

  // 4. Nothing blocking was seen. Without satellite land cover the absence of map features proves little.
  if (!wc) {
    const message = osm
      ? "Satellite land-cover data couldn’t be checked. The map shows no buildings, water or roads here, but map coverage can be incomplete, so we couldn’t confirm that this area is farmland."
      : "Land-cover data couldn’t be checked right now, so we couldn’t confirm that this area is farmland. Make sure the outline covers cultivated ground.";
    return uncertain("land_cover_unavailable", message, evidence, partialWarnings(osm, null));
  }

  const warnings = partialWarnings(osm, wc);
  if (!osm) {
    if (wc.shares.cropland < LAND_RULES.worldCoverCropland) {
      return uncertain(
        "land_cover_unavailable",
        "Map data for buildings and roads couldn’t be checked, and satellite land cover doesn’t show cropland here, so we couldn’t confirm that this area is farmland.",
        evidence,
        warnings,
      );
    }
    warnings.push("Map data for buildings and roads couldn’t be checked; the land was judged from 10 m satellite land cover only.");
  }
  return { status: "suitable", reason: null, message: "This area looks like open land that can be farmed.", evidence, warnings };
}
