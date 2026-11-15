import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CogHeaderTruncatedError, decodeTile, parseCogHeader, tileRange } from "./cog-raster";

/**
 * Builds a little-endian, tiled, single-band 8-bit GeoTIFF shaped like an ESA WorldCover COG
 * (DEFLATE, palette, NoData "0"), 32×16 pixels in two 16×16 tiles.
 */
function makeCog({ predictor = 1, compress = true }: { predictor?: 1 | 2; compress?: boolean } = {}) {
  const W = 32, H = 16, T = 16;
  const tiles = [0, 1].map((t) => {
    const px = new Uint8Array(T * T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px[y * T + x] = t === 0 ? 40 : x < 8 ? 50 : 80;
    if (predictor === 2) {
      for (let y = 0; y < T; y++) for (let x = T - 1; x > 0; x--) px[y * T + x] = (px[y * T + x] - px[y * T + x - 1]) & 0xff;
    }
    return compress ? new Uint8Array(deflateSync(px)) : px;
  });

  type Entry = { tag: number; type: number; values: number[] | string };
  const entries: Entry[] = [
    { tag: 256, type: 3, values: [W] },
    { tag: 257, type: 3, values: [H] },
    { tag: 258, type: 3, values: [8] },
    { tag: 259, type: 3, values: [compress ? 8 : 1] },
    { tag: 277, type: 3, values: [1] },
    { tag: 317, type: 3, values: [predictor] },
    { tag: 322, type: 3, values: [T] },
    { tag: 323, type: 3, values: [T] },
    { tag: 324, type: 4, values: [0, 0] }, // patched below
    { tag: 325, type: 4, values: tiles.map((t) => t.length) },
    { tag: 33550, type: 12, values: [1 / 12000, 1 / 12000, 0] },
    { tag: 33922, type: 12, values: [0, 0, 0, 69, 42, 0] },
    { tag: 42113, type: 2, values: "0\0" },
  ];
  const size: Record<number, number> = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const ifdSize = 2 + entries.length * 12 + 4;
  let extra = 8 + ifdSize;
  const placed = entries.map((e) => {
    const n = typeof e.values === "string" ? e.values.length : e.values.length;
    const bytes = size[e.type] * n;
    const at = bytes > 4 ? extra : -1;
    if (bytes > 4) extra += bytes + (bytes % 2);
    return { ...e, n, bytes, at };
  });
  const dataStart = extra;
  const offsets = [dataStart, dataStart + tiles[0].length];
  placed.find((e) => e.tag === 324)!.values = offsets;

  const buf = new Uint8Array(dataStart + tiles[0].length + tiles[1].length);
  const v = new DataView(buf.buffer);
  buf.set([0x49, 0x49]);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, placed.length, true);
  const write = (type: number, at: number, val: number) => {
    if (type === 3) v.setUint16(at, val, true);
    else if (type === 4) v.setUint32(at, val, true);
    else if (type === 12) v.setFloat64(at, val, true);
    else buf[at] = val;
  };
  placed.forEach((e, i) => {
    const p = 10 + i * 12;
    v.setUint16(p, e.tag, true);
    v.setUint16(p + 2, e.type, true);
    v.setUint32(p + 4, e.n, true);
    const vals = typeof e.values === "string" ? [...e.values].map((c) => c.charCodeAt(0)) : e.values;
    if (e.at < 0) vals.forEach((val, k) => write(e.type, p + 8 + k * size[e.type], val));
    else {
      v.setUint32(p + 8, e.at, true);
      vals.forEach((val, k) => write(e.type, e.at + k * size[e.type], val));
    }
  });
  v.setUint32(10 + placed.length * 12, 0, true);
  buf.set(tiles[0], offsets[0]);
  buf.set(tiles[1], offsets[1]);
  return { buf, headerBytes: dataStart };
}

describe("parseCogHeader", () => {
  it("reads size, tiling, georeference and NoData", () => {
    const { buf } = makeCog();
    const h = parseCogHeader(buf);
    expect(h.levels).toHaveLength(1);
    expect(h.levels[0]).toMatchObject({ width: 32, height: 16, tileWidth: 16, tileHeight: 16, compression: 8, predictor: 1 });
    expect(h.origin).toEqual([69, 42]);
    expect(h.pixelSize[0]).toBeCloseTo(1 / 12000, 12);
    expect(h.noData).toBe(0);
  });

  it("asks for more bytes when the tag arrays are cut off", () => {
    const { buf } = makeCog();
    expect(() => parseCogHeader(buf.subarray(0, 40))).toThrow(CogHeaderTruncatedError);
  });

  it("rejects files that are not TIFF", () => {
    expect(() => parseCogHeader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/Not a TIFF/);
  });
});

describe("decodeTile", () => {
  it.each([
    ["DEFLATE", { compress: true }],
    ["uncompressed", { compress: false }],
    ["DEFLATE + horizontal predictor", { compress: true, predictor: 2 as const }],
  ])("returns the original class values (%s)", (_, opts) => {
    const { buf } = makeCog(opts);
    const h = parseCogHeader(buf);
    const level = h.levels[0];
    const r0 = tileRange(level, 0, 0)!;
    const r1 = tileRange(level, 1, 0)!;
    const t0 = decodeTile(level, buf.subarray(r0.offset, r0.offset + r0.length));
    const t1 = decodeTile(level, buf.subarray(r1.offset, r1.offset + r1.length));
    expect(new Set(t0)).toEqual(new Set([40]));
    expect(t1[0]).toBe(50);
    expect(t1[7]).toBe(50);
    expect(t1[8]).toBe(80);
    expect(t1[16 * 16 - 1]).toBe(80);
  });

  it("treats a zero-length tile as empty", () => {
    const { buf } = makeCog();
    const level = { ...parseCogHeader(buf).levels[0], tileByteCounts: [0, 10] };
    expect(tileRange(level, 0, 0)).toBeNull();
  });
});
