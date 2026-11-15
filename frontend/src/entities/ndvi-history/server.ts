import "server-only";
import type { LonLat } from "@/entities/field";
import { postAsterraApi } from "@/shared/api/asterra-api";
import type { NdviHistory } from "./model/types";

/** Last 12 months of Sentinel-2 NDVI for the polygon, every 10 days (backend caches it). */
export function fetchNdviHistory(polygon: LonLat[]): Promise<NdviHistory> {
  return postAsterraApi<NdviHistory>("/fields/ndvi", { polygon, intervalDays: 10 });
}
