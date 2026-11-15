import { inflateSync } from "node:zlib";

/** An 8-bit RGBA image, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/**
 * Decodes an 8-bit, non-interlaced truecolour PNG (colour type 6 = RGBA or 2 = RGB) into RGBA.
 * Returns null for anything else. Used for NASA GIBS true-colour tiles (HLS).
 */
export function decodeRgbaPng(buf: Uint8Array): RgbaImage | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      bitDepth = buf[pos + 16];
      colorType = buf[pos + 17];
      interlace = buf[pos + 20];
    } else if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if ((colorType !== 6 && colorType !== 2) || bitDepth !== 8 || interlace !== 0 || !width || !height) return null;

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
  if (raw.length < height * (stride + 1)) return null;
  const pixels = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
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
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      pixels[o] = out[x * bpp];
      pixels[o + 1] = out[x * bpp + 1];
      pixels[o + 2] = out[x * bpp + 2];
      pixels[o + 3] = bpp === 4 ? out[x * bpp + 3] : 255;
    }
    prev = out;
  }
  return { width, height, pixels };
}
