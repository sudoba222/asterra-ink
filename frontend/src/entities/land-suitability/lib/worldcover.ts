import type { WorldCoverClass, WorldCoverSample } from "../model/types";

/** ESA WorldCover v200 class values (https://esa-worldcover.org/en/data-access). */
export const WORLDCOVER_CLASSES: Record<number, WorldCoverClass> = {
  10: "tree",
  20: "shrubland",
  30: "grassland",
  40: "cropland",
  50: "builtUp",
  60: "bare",
  70: "snowIce",
  80: "water",
  90: "wetland",
  95: "mangroves",
  100: "moss",
};

/** Turns raw pixel counts per class value into shares of the valid pixels. */
export function worldCoverShares(counts: Record<string, number>, pixels: number): WorldCoverSample["shares"] {
  const shares = Object.fromEntries(Object.values(WORLDCOVER_CLASSES).map((c) => [c, 0])) as WorldCoverSample["shares"];
  if (pixels <= 0) return shares;
  for (const [value, n] of Object.entries(counts)) {
    const cls = WORLDCOVER_CLASSES[Number(value)];
    if (cls) shares[cls] = Math.round((n / pixels) * 1000) / 1000;
  }
  return shares;
}
