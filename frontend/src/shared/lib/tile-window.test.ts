import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeRgbaPng } from "./rgba-png";
import { boxWindow, clearShare } from "./tile-window";

/** Builds a real PNG (colour type 6 or 2) with the given per-row filter, from RGBA pixels. */
function png(width: number, height: number, rgba: (x: number, y: number) => [number, number, number, number], colorType: 2 | 6 = 6, filter = 0): Uint8Array {
  const bpp = colorType === 6 ? 4 : 3;
  const rows: number[] = [];
  let prev = new Array(width * bpp).fill(0);
  for (let y = 0; y < height; y++) {
    const line: number[] = [];
    for (let x = 0; x < width; x++) line.push(...rgba(x, y).slice(0, bpp));
    rows.push(filter);
    line.forEach((v, i) => {
      const a = i >= bpp ? line[i - bpp] : 0;
      rows.push(filter === 1 ? (v - a) & 0xff : filter === 2 ? (v - prev[i]) & 0xff : v);
    });
    prev = line;
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out; // CRC not checked by the decoder
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Uint8Array.from(rows))), chunk("IEND", new Uint8Array())];
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

describe("decodeRgbaPng", () => {
  it("decodes RGBA with Sub and Up filters", () => {
    for (const filter of [0, 1, 2]) {
      const img = decodeRgbaPng(png(3, 2, (x, y) => [x * 10, y * 20, 7, 255 - x], 6, filter))!;
      expect(img.width).toBe(3);
      expect([...img.pixels.subarray(4 * 4, 4 * 5)]).toEqual([10, 20, 7, 254]);
    }
  });
  it("decodes RGB as opaque RGBA", () => {
    const img = decodeRgbaPng(png(2, 1, () => [1, 2, 3, 0], 2))!;
    expect([...img.pixels]).toEqual([1, 2, 3, 255, 1, 2, 3, 255]);
  });
  it("rejects other PNGs", () => {
    expect(decodeRgbaPng(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("clearShare", () => {
  const field = { west: 68.8, south: 37.85, east: 68.803, north: 37.853 };
  const w = boxWindow(field, 12);
  const tile = (pixel: (x: number, y: number) => [number, number, number, number]) => decodeRgbaPng(png(256, 256, pixel))!;
  const inside = (x: number, y: number) => x >= w.x0 && x < w.x1 && y >= w.y0 && y < w.y1;

  it("puts the field window inside its zoom-12 tile", () => {
    expect([w.tileX, w.tileY]).toEqual([2830, 1582]);
    expect(w.x1 - w.x0).toBeGreaterThanOrEqual(12);
    expect(w.y1 - w.y0).toBeGreaterThanOrEqual(12);
  });
  it("counts clear land, not cloud or gaps", () => {
    expect(clearShare(tile(() => [110, 120, 90, 255]), w, 160)).toBe(1);
    expect(clearShare(tile(() => [235, 238, 240, 255]), w, 160)).toBe(0);
    expect(clearShare(tile(() => [110, 120, 90, 0]), w, 160)).toBe(0);
  });
  it("only looks at the field, not the rest of the tile", () => {
    expect(clearShare(tile((x, y) => (inside(x, y) ? [110, 120, 90, 255] : [240, 240, 240, 255])), w, 160)).toBe(1);
  });
});
