"use client";

import type { AdminArea, AdminLevelResult } from "@/shared/api/geoboundaries";
import { useFetchJson } from "@/shared/api";

export type { AdminArea, AdminLevelResult };

/** Regions of a country (no regionId) or districts inside a region. */
export function useAdminAreas(iso3: string | null, regionId?: string | null) {
  const url = !iso3
    ? null
    : regionId === undefined
      ? `/api/admin-areas?iso=${iso3}`
      : regionId
        ? `/api/admin-areas?iso=${iso3}&region=${encodeURIComponent(regionId)}`
        : null;
  return useFetchJson<AdminLevelResult>(url);
}
