/** Deterministic PRNG (mulberry32) so sample data is stable per location. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromCoords(lat: number, lon: number): number {
  return Math.abs(Math.round(lat * 1000) * 73856093 ^ Math.round(lon * 1000) * 19349663);
}
