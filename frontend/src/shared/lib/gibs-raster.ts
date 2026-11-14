import { inflateSync } from "node:zlib";

/**
 * Pure helpers for reading NASA GIBS paletted PNG tiles as data.
 * GIBS renders each product with a published colormap; every palette colour maps
 * to one data bin, so colours can be reversed into values exactly
 * (https://nasa-gibs.github.io/gibs-api-docs/colormaps/).
 */

export interface PalettedImage {
  width: number;
  height: number;
  /** One palette index per pixel, row-major. */
  indices: Uint8Array;
  /** RGB triplets. */
  palette: Uint8Array;
  /** Alpha per palette entry (tRNS), 255 if absent. */
  alpha: Uint8Array;
}

/** Decodes an 8-bit, non-interlaced, colour-type-3 PNG. Returns null for anything else. */
export function decodePalettedPng(buf: Uint8Array): PalettedImage | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = new Uint8Array(0);
  let alpha: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = body.slice();
    else if (type === "tRNS") alpha = body.slice();
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (colorType !== 3 || bitDepth !== 8 || interlace !== 0 || !width || !height) return null;

  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
  const indices = new Uint8Array(width * height);
  const stride = width; // 1 byte per pixel
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x > 0 ? out[x - 1] : 0;
      const b = prev[x];
      const c = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
    indices.set(out, y * width);
    prev = out;
  }
  const n = palette.length / 3;
  const fullAlpha = new Uint8Array(n).fill(255);
  if (alpha) fullAlpha.set(alpha.subarray(0, n));
  return { width, height, indices, palette, alpha: fullAlpha };
}

export interface ColorBin {
  min: number;
  max: number;
  nodata: boolean;
}

/** Parses a GIBS v1.3 colormap XML into `"r,g,b" → value bin`. */
export function parseGibsColormap(xml: string): Map<string, ColorBin> {
  const map = new Map<string, ColorBin>();
  const re = /<ColorMapEntry\s+([^>]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const rgb = /rgb="([^"]+)"/.exec(attrs)?.[1];
    const value = /value="([^"]+)"/.exec(attrs)?.[1];
    if (!rgb || !value) continue;
    const nums = value.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)?.map(Number) ?? [];
    if (nums.length === 0) continue;
    map.set(rgb.replace(/\s/g, ""), {
      min: nums[0],
      max: nums[nums.length - 1],
      nodata: /nodata="true"/.test(attrs),
    });
  }
  return map;
}

/* ---------- Web Mercator (EPSG:3857) pixel math, 256-px tiles ---------- */

export function lonLatToGlobalPixel(lon: number, lat: number, zoom: number): [number, number] {
  const size = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * size;
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
  return [x, y];
}

export function globalPixelToLonLat(px: number, py: number, zoom: number): [number, number] {
  const size = 256 * 2 ** zoom;
  const lon = (px / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * py) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lon, lat];
}

/** Value at a pixel, or null for transparent / nodata / unknown colours. */
export function pixelValue(img: PalettedImage, x: number, y: number, bins: Map<string, ColorBin>): number | null {
  const i = img.indices[y * img.width + x];
  if (img.alpha[i] === 0) return null;
  const key = `${img.palette[i * 3]},${img.palette[i * 3 + 1]},${img.palette[i * 3 + 2]}`;
  const bin = bins.get(key);
  if (!bin || bin.nodata) return null;
  return (bin.min + bin.max) / 2;
}
