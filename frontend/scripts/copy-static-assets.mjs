#!/usr/bin/env node
/**
 * Copies browser-only static assets into /public (all git-ignored):
 *   public/cesium  ← cesium/Build/Cesium (Cesium.js, Workers, Assets, ThirdParty, Widgets)
 *   public/geo     ← world-countries/data/<iso3>.geo.json (simplified, rounded)
 *   public/flags   ← world-countries/data/<iso3>.svg
 *
 * Runs on postinstall / predev / prebuild and skips work when up to date.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pub = path.join(root, "public");

function pkgDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
}

function stamp(dir, version) {
  const file = path.join(dir, ".version");
  if (existsSync(file) && readFileSync(file, "utf8") === version) return true;
  return false;
}

function writeStamp(dir, version) {
  writeFileSync(path.join(dir, ".version"), version);
}

/* ---------- Cesium ---------- */
function copyCesium() {
  const dir = pkgDir("cesium");
  const { version } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const out = path.join(pub, "cesium");
  if (stamp(out, version)) return console.log(`[assets] cesium ${version} up to date`);
  mkdirSync(out, { recursive: true });
  const src = path.join(dir, "Build", "Cesium");
  for (const entry of ["Cesium.js", "Workers", "Assets", "ThirdParty", "Widgets"]) {
    cpSync(path.join(src, entry), path.join(out, entry), { recursive: true });
  }
  writeStamp(out, version);
  console.log(`[assets] copied cesium ${version} → public/cesium`);
}

/* ---------- Country geometry + flags ---------- */
const PRECISION = 1000; // 3 decimals ≈ 100 m
const TOLERANCE = 0.01; // degrees, radial-distance simplification ≈ 1 km

function simplifyRing(ring) {
  if (ring.length <= 8) return ring.map(roundPt);
  const out = [roundPt(ring[0])];
  let [px, py] = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i];
    if (Math.abs(x - px) > TOLERANCE || Math.abs(y - py) > TOLERANCE) {
      out.push(roundPt(ring[i]));
      px = x;
      py = y;
    }
  }
  out.push(roundPt(ring[ring.length - 1]));
  return out.length >= 4 ? out : ring.map(roundPt);
}

function roundPt([x, y]) {
  return [Math.round(x * PRECISION) / PRECISION, Math.round(y * PRECISION) / PRECISION];
}

function simplifyGeometry(geom) {
  if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.coordinates.map(simplifyRing) };
  if (geom.type === "MultiPolygon")
    return { type: "MultiPolygon", coordinates: geom.coordinates.map((p) => p.map(simplifyRing)) };
  return geom;
}

function copyCountries() {
  const dir = pkgDir("world-countries");
  const { version } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const geoOut = path.join(pub, "geo");
  const flagOut = path.join(pub, "flags");
  const key = `${version}-p${PRECISION}-t${TOLERANCE}`;
  if (stamp(geoOut, key) && stamp(flagOut, version)) return console.log(`[assets] countries ${version} up to date`);
  mkdirSync(geoOut, { recursive: true });
  mkdirSync(flagOut, { recursive: true });
  const data = path.join(dir, "data");
  let n = 0;
  for (const file of readdirSync(data)) {
    const iso3 = file.slice(0, 3).toUpperCase();
    if (file.endsWith(".geo.json")) {
      const fc = JSON.parse(readFileSync(path.join(data, file), "utf8"));
      const features = fc.features
        .filter((f) => f.geometry) // e.g. Kosovo ships without geometry → centroid fallback in the app
        .map((f) => ({ type: "Feature", properties: {}, geometry: simplifyGeometry(f.geometry) }));
      if (features.length === 0) continue;
      writeFileSync(path.join(geoOut, `${iso3}.json`), JSON.stringify({ type: "FeatureCollection", features }));
      n++;
    } else if (file.endsWith(".svg")) {
      cpSync(path.join(data, file), path.join(flagOut, `${iso3}.svg`));
    }
  }
  writeStamp(geoOut, key);
  writeStamp(flagOut, version);
  console.log(`[assets] wrote ${n} country geometries → public/geo, flags → public/flags`);
}

try {
  copyCesium();
  copyCountries();
} catch (err) {
  console.error("[assets] failed to copy static assets:", err);
  process.exitCode = 1;
}
