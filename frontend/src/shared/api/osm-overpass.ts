import "server-only";
import { cacheLife } from "next/cache";

/**
 * OpenStreetMap features that rule out cultivation, fetched from the public Overpass API (no key).
 * Two parts: features crossing the field polygon (`poly:` filter), plus large areas that enclose
 * the field centre without crossing it (`is_in`), e.g. a lake drawn around the whole field.
 * Data © OpenStreetMap contributors, ODbL.
 */
/** Tried in order; the next one only when the previous fails (public servers are often busy). Comma-separated override. */
const ENDPOINTS = (process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export interface OsmFeature {
  tags: Record<string, string>;
  /** One path for a way; every outer/inner member path for a relation. [lon, lat]. */
  paths: Array<Array<[number, number]>>;
}

const LANDUSE = "reservoir|basin|railway|residential|industrial|commercial|retail|construction|military|cemetery|landfill|quarry|garages|brownfield|depot|port";
const HIGHWAY =
  "motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|road|busway|service|pedestrian";

export function overpassQuery(ring: Array<[number, number]>): string {
  const poly = ring.map(([lon, lat]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(" ");
  const f = `(poly:"${poly}")`;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const enclosing = (sel: string) => `way(pivot.a)${sel};rel(pivot.a)${sel};`;
  return `[out:json][timeout:40][maxsize:67108864];
(
  wr["building"]${f};
  wr["natural"~"^(water|glacier)$"]${f};
  wr["waterway"~"^(riverbank|river|canal)$"]${f};
  wr["landuse"~"^(${LANDUSE})$"]${f};
  way["highway"~"^(${HIGHWAY})$"]${f};
  way["railway"~"^(rail|light_rail|narrow_gauge|subway|monorail)$"]${f};
  wr["aeroway"~"^(runway|taxiway|apron|helipad|terminal|hangar)$"]${f};
  wr["amenity"~"^(parking|grave_yard)$"]${f};
  wr["area:highway"]${f};
);
out tags geom;
is_in(${lat.toFixed(6)},${lon.toFixed(6)})->.a;
(
  ${enclosing(`["natural"~"^(water|glacier)$"]`)}
  ${enclosing(`["waterway"="riverbank"]`)}
  ${enclosing(`["landuse"~"^(${LANDUSE})$"]`)}
  ${enclosing(`["amenity"~"^(parking|grave_yard)$"]`)}
  ${enclosing(`["building"]`)}
);
out tags geom;`;
}

interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}
interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<OverpassGeometryPoint | null>;
  members?: Array<{ type: string; role: string; geometry?: Array<OverpassGeometryPoint | null> }>;
}

const toPath = (g: Array<OverpassGeometryPoint | null> | undefined) => (g ?? []).filter((p): p is OverpassGeometryPoint => p !== null).map((p) => [p.lon, p.lat] as [number, number]);

/** Parses an Overpass JSON answer; duplicates (a feature found by both parts) are kept once. */
export function parseOverpass(json: { elements?: OverpassElement[] }): OsmFeature[] {
  const seen = new Set<string>();
  const out: OsmFeature[] = [];
  for (const el of json.elements ?? []) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id) || !el.tags) continue;
    seen.add(id);
    if (el.type === "way") {
      const path = toPath(el.geometry);
      if (path.length >= 2) out.push({ tags: el.tags, paths: [path] });
    } else if (el.type === "relation") {
      const paths = (el.members ?? [])
        .filter((m) => m.type === "way" && (m.role === "outer" || m.role === "inner" || m.role === ""))
        .map((m) => toPath(m.geometry))
        .filter((p) => p.length >= 2);
      if (paths.length) out.push({ tags: el.tags, paths });
    }
  }
  return out;
}

/** Throws when Overpass can't answer, so a failure is never cached as "nothing mapped here". */
export async function fetchOsmLandFeatures(ring: Array<[number, number]>): Promise<{ features: OsmFeature[]; osmBase: string | null }> {
  "use cache";
  cacheLife("days");
  const query = overpassQuery(ring);
  const errors: string[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "asterra-field-check/0.1 (land-use validation)" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) throw new Error(`responded ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string; osm3s?: { timestamp_osm_base?: string } };
      // Overpass reports timeouts and memory limits as a "remark" on an otherwise successful, truncated answer.
      if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      return { features: parseOverpass(json), osmBase: json.osm3s?.timestamp_osm_base ?? null };
    } catch (err) {
      errors.push(`${new URL(endpoint).host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Overpass unavailable (${errors.join("; ")})`);
}
