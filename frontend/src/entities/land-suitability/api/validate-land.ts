import "server-only";
import type { LonLat } from "@/entities/field";
import { sampleWorldCover } from "@/shared/api/esa-worldcover";
import { fetchOsmLandFeatures } from "@/shared/api/osm-overpass";
import { classifyLand } from "../lib/classify";
import { measureOsmCoverage } from "../lib/osm-coverage";
import { worldCoverShares } from "../lib/worldcover";
import type { LandSourceStatus, LandSuitability, OsmCoverage, WorldCoverSample } from "../model/types";

/**
 * Checks the whole field polygon against satellite land cover (ESA WorldCover) and mapped
 * geometry (OpenStreetMap). Each source can fail on its own; the rules then return
 * "uncertain" instead of guessing.
 */
export async function validateLand(ring: LonLat[]): Promise<LandSuitability> {
  // Round the ring a little so nearby edits share cache entries (≈1 m), as for field conditions.
  const key: Array<[number, number]> = ring.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  const [osmR, wcR] = await Promise.allSettled([fetchOsmLandFeatures(key), sampleWorldCover(key)]);

  if (osmR.status === "rejected") console.error("[land-suitability] OpenStreetMap failed:", osmR.reason);
  if (wcR.status === "rejected") console.error("[land-suitability] ESA WorldCover failed:", wcR.reason);

  const osm: OsmCoverage | null = osmR.status === "fulfilled" ? measureOsmCoverage(key, osmR.value.features) : null;
  const wcRaw = wcR.status === "fulfilled" ? wcR.value : null;
  const worldCover: WorldCoverSample | null = wcRaw
    ? { shares: worldCoverShares(wcRaw.counts, wcRaw.pixels), pixels: wcRaw.pixels, resolutionM: wcRaw.resolutionM, smallerThanPixel: wcRaw.smallerThanPixel }
    : null;

  const decision = classifyLand({ osm, worldCover });

  const unreachable = "the service couldn’t be reached. Please try again later";
  const sources: LandSourceStatus[] = [
    {
      id: "esa-worldcover",
      name: "ESA WorldCover 2021 — 10 m satellite land cover (Copernicus Sentinel-1/2)",
      ok: worldCover !== null,
      detail: worldCover
        ? `${worldCover.smallerThanPixel ? "field smaller than one pixel" : `${worldCover.pixels} pixels`} at ${worldCover.resolutionM} m · CC BY 4.0`
        : wcR.status === "rejected"
          ? `Unavailable: ${unreachable}`
          : "No land-cover pixels for this area (open sea or outside coverage)",
      url: wcRaw?.urls[0] ?? null,
    },
    {
      id: "osm",
      name: "OpenStreetMap — buildings, water, roads and land use (Overpass API)",
      ok: osm !== null,
      detail: osm
        ? `${osm.features} mapped feature${osm.features === 1 ? "" : "s"} in the field · ${osm.samples} sample points every ${osm.spacingM} m${
            osmR.status === "fulfilled" && osmR.value.osmBase ? ` · map data of ${osmR.value.osmBase.slice(0, 10)}` : ""
          } · ODbL`
        : `Unavailable: ${unreachable}`,
      url: "https://www.openstreetmap.org/copyright",
    },
  ];

  return { ...decision, osm, worldCover, sources, checkedAt: new Date().toISOString() };
}
