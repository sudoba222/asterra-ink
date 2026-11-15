import type { BlockingClass, BlockingShares, OsmCoverage } from "../model/types";

/** [lon, lat] in WGS84 degrees. */
type LonLat = [number, number];

/** One OpenStreetMap way or relation with resolved geometry. A relation carries every member path. */
export interface OsmElement {
  tags: Record<string, string>;
  paths: LonLat[][];
}

export type OsmFeatureClass =
  | { cls: BlockingClass | "residential"; shape: "area"; landUse?: string }
  | { cls: BlockingClass; shape: "line"; halfWidthM: number };

/** Land uses that are clearly not farmland. Residential is handled separately: household plots are farmed. */
export const NON_AGRICULTURAL_LANDUSE = new Set([
  "industrial",
  "commercial",
  "retail",
  "construction",
  "military",
  "cemetery",
  "landfill",
  "quarry",
  "garages",
  "brownfield",
  "depot",
  "port",
]);

/** Full carriageway width (m) when the map gives neither `width` nor `lanes`. Farm tracks and paths are not counted. */
const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 24,
  trunk: 20,
  primary: 14,
  secondary: 10,
  tertiary: 8,
  motorway_link: 8,
  trunk_link: 8,
  primary_link: 8,
  secondary_link: 7,
  tertiary_link: 6,
  unclassified: 6,
  residential: 6,
  living_street: 6,
  road: 6,
  busway: 7,
  service: 5,
};

const RAIL = new Set(["rail", "light_rail", "narrow_gauge", "subway", "monorail"]);

function metres(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return /ft|'/.test(v) ? n * 0.3048 : n;
}

const yes = (v: string | undefined) => v !== undefined && v !== "no";

/** Maps OSM tags to a land class. Returns null for anything that does not affect cultivation. */
export function classifyOsmTags(tags: Record<string, string>, closed: boolean): OsmFeatureClass | null {
  const underground = yes(tags.tunnel) || tags.covered === "yes" || tags.location === "underground" || Number(tags.layer) < 0;
  const seasonal = tags.intermittent === "yes" || tags.seasonal === "yes";

  if (yes(tags.building) || tags.aeroway === "terminal" || tags.aeroway === "hangar") return closed ? { cls: "building", shape: "area" } : null;

  if (tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "reservoir" || tags.landuse === "basin") {
    return closed && !seasonal ? { cls: "water", shape: "area" } : null;
  }
  if ((tags.waterway === "river" || tags.waterway === "canal") && !underground && !seasonal) {
    const width = metres(tags.width) ?? (tags.waterway === "river" ? 20 : 6);
    return { cls: "water", shape: "line", halfWidthM: width / 2 };
  }

  if (tags.highway && ROAD_WIDTH_M[tags.highway] !== undefined) {
    if (closed && tags.area === "yes") return { cls: "infrastructure", shape: "area" };
    if (underground) return null;
    const lanes = Number.parseInt(tags.lanes ?? "", 10);
    const width = metres(tags.width) ?? (lanes > 0 ? lanes * 3.5 : ROAD_WIDTH_M[tags.highway]);
    return { cls: "infrastructure", shape: "line", halfWidthM: width / 2 };
  }
  if (tags.highway === "pedestrian" && closed && tags.area === "yes") return { cls: "infrastructure", shape: "area" };
  if (tags.railway && RAIL.has(tags.railway)) return underground ? null : { cls: "infrastructure", shape: "line", halfWidthM: 3 };
  if (tags.aeroway === "runway" || tags.aeroway === "taxiway") {
    if (closed && tags.area === "yes") return { cls: "infrastructure", shape: "area" };
    const width = metres(tags.width) ?? (tags.aeroway === "runway" ? 45 : 23);
    return { cls: "infrastructure", shape: "line", halfWidthM: width / 2 };
  }
  if (tags.aeroway === "apron" || tags.aeroway === "helipad" || tags["area:highway"] || (tags.amenity === "parking" && tags.parking !== "underground") || tags.landuse === "railway") {
    return closed ? { cls: "infrastructure", shape: "area" } : null;
  }

  if (tags.landuse && NON_AGRICULTURAL_LANDUSE.has(tags.landuse)) return closed ? { cls: "nonAgricultural", shape: "area", landUse: tags.landuse } : null;
  if (tags.amenity === "grave_yard") return closed ? { cls: "nonAgricultural", shape: "area", landUse: "cemetery" } : null;
  if (tags.natural === "glacier") return closed ? { cls: "nonAgricultural", shape: "area", landUse: "glacier" } : null;
  if (tags.landuse === "residential") return closed ? { cls: "residential", shape: "area" } : null;
  return null;
}

/* ---------- geometry in local metres ---------- */

type XY = [number, number];

interface Prepared {
  cls: OsmFeatureClass;
  paths: XY[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  hit: boolean;
}

function insideParity(x: number, y: number, paths: XY[][]): boolean {
  // Even-odd over every member path: correct for outer + inner rings without assembling them.
  let inside = false;
  for (const p of paths) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function nearLine(x: number, y: number, paths: XY[][], r: number): boolean {
  const r2 = r * r;
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1];
      const [bx, by] = p[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const ex = ax + t * dx - x;
      const ey = ay + t * dy - y;
      if (ex * ex + ey * ey <= r2) return true;
    }
  }
  return false;
}

const isClosed = (p: LonLat[]) => p.length >= 4 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];

/**
 * Measures how much of the polygon each blocking class covers, on a regular grid of up to
 * `maxSamples` points inside the polygon (spacing ≥ 1 m). Areas use point-in-polygon; roads,
 * rails and rivers count within half their width of the centre line.
 */
export function measureOsmCoverage(ring: LonLat[], elements: OsmElement[], maxSamples = 2500): OsmCoverage {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const my = 111_320;
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([lon, lat]: LonLat): XY => [(lon - lon0) * mx, (lat - lat0) * my];

  const field = ring.map(toXY);
  const fx = field.map((p) => p[0]);
  const fy = field.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...fx), Math.max(...fx), Math.min(...fy), Math.max(...fy)];
  let area = 0;
  for (let i = 0, j = field.length - 1; i < field.length; j = i++) area += field[j][0] * field[i][1] - field[i][0] * field[j][1];
  area = Math.abs(area) / 2;

  const spacing = Math.max(1, Math.sqrt(area / maxSamples));
  const points: XY[] = [];
  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    for (let x = minX + spacing / 2; x < maxX; x += spacing) {
      if (insideParity(x, y, [field])) points.push([x, y]);
    }
  }
  if (points.length === 0) points.push([fx.reduce((a, b) => a + b, 0) / fx.length, fy.reduce((a, b) => a + b, 0) / fy.length]);

  const features: Prepared[] = [];
  for (const el of elements) {
    const closed = el.paths.length > 1 || (el.paths[0] ? isClosed(el.paths[0]) : false);
    const cls = classifyOsmTags(el.tags, closed);
    if (!cls) continue;
    const paths = el.paths.filter((p) => p.length >= 2).map((p) => p.map(toXY));
    if (!paths.length) continue;
    const pad = cls.shape === "line" ? cls.halfWidthM : 0;
    const xs = paths.flat().map((p) => p[0]);
    const ys = paths.flat().map((p) => p[1]);
    const f: Prepared = { cls, paths, minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad, hit: false };
    // Areas can enclose the whole field, so only lines and areas fully outside the field box are dropped.
    if (f.maxX < minX || f.minX > maxX || f.maxY < minY || f.minY > maxY) continue;
    features.push(f);
  }

  const counts: Record<BlockingClass, number> = { building: 0, water: 0, infrastructure: 0, nonAgricultural: 0 };
  const landUses = new Map<string, number>();
  let blocked = 0;
  let residential = 0;

  for (const [x, y] of points) {
    const here = new Set<BlockingClass>();
    let inResidential = false;
    for (const f of features) {
      if (x < f.minX || x > f.maxX || y < f.minY || y > f.maxY) continue;
      const covered = f.cls.shape === "line" ? nearLine(x, y, f.paths, f.cls.halfWidthM) : insideParity(x, y, f.paths);
      if (!covered) continue;
      f.hit = true;
      if (f.cls.cls === "residential") inResidential = true;
      else {
        here.add(f.cls.cls);
        if (f.cls.shape === "area" && f.cls.landUse) landUses.set(f.cls.landUse, (landUses.get(f.cls.landUse) ?? 0) + 1);
      }
    }
    for (const c of here) counts[c]++;
    if (here.size) blocked++;
    if (inResidential) residential++;
  }

  const n = points.length;
  const share = (v: number) => Math.round((v / n) * 1000) / 1000;
  const shares: BlockingShares = {
    building: share(counts.building),
    water: share(counts.water),
    infrastructure: share(counts.infrastructure),
    nonAgricultural: share(counts.nonAgricultural),
  };
  const landUse = [...landUses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    shares,
    blocked: share(blocked),
    residential: share(residential),
    landUse,
    samples: n,
    spacingM: Math.round(spacing * 10) / 10,
    features: features.filter((f) => f.hit).length,
  };
}
