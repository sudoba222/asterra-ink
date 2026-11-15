import { inflateSync } from "node:zlib";

/**
 * Minimal Cloud-Optimised GeoTIFF reader for single-band 8-bit rasters (e.g. ESA WorldCover).
 * Only what a categorical land-cover map needs: the IFD chain (full resolution + overviews),
 * tile byte ranges and DEFLATE/uncompressed tiles. Network access lives in the caller,
 * which fetches the header once and then only the byte ranges of the tiles it needs.
 */

export interface CogLevel {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tileOffsets: number[];
  tileByteCounts: number[];
  compression: number;
  predictor: number;
}

export interface CogHeader {
  /** Index 0 = full resolution, then overviews (each usually half the previous). */
  levels: CogLevel[];
  /** Top-left corner of the full-resolution grid, [lon, lat]. */
  origin: [number, number];
  /** Full-resolution pixel size in degrees, [x, y] (both positive). */
  pixelSize: [number, number];
  noData: number | null;
}

/** Thrown when the header's tag arrays reach past the bytes fetched so far. */
export class CogHeaderTruncatedError extends Error {
  constructor(readonly needBytes: number) {
    super(`COG header needs ${needBytes} bytes`);
  }
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

export function parseCogHeader(buf: Uint8Array): CogHeader {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const order = String.fromCharCode(buf[0], buf[1]);
  if (order !== "II" && order !== "MM") throw new Error("Not a TIFF file");
  const le = order === "II";
  if (view.getUint16(2, le) !== 42) throw new Error("BigTIFF or unknown TIFF variant is not supported");

  const need = (end: number) => {
    if (end > buf.length) throw new CogHeaderTruncatedError(end);
  };
  const read = (type: number, offset: number) => {
    switch (type) {
      case 1:
      case 2:
      case 6:
      case 7:
        return buf[offset];
      case 3:
      case 8:
        return view.getUint16(offset, le);
      case 4:
      case 9:
        return view.getUint32(offset, le);
      case 11:
        return view.getFloat32(offset, le);
      case 12:
        return view.getFloat64(offset, le);
      case 16:
        return Number(view.getBigUint64(offset, le));
      default:
        throw new Error(`Unsupported TIFF field type ${type}`);
    }
  };

  const levels: CogLevel[] = [];
  let origin: [number, number] | null = null;
  let pixelSize: [number, number] | null = null;
  let noData: number | null = null;

  let ifd = view.getUint32(4, le);
  while (ifd !== 0) {
    need(ifd + 2);
    const count = view.getUint16(ifd, le);
    need(ifd + 2 + count * 12 + 4);
    const tags = new Map<number, number[] | string>();
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      const tag = view.getUint16(e, le);
      const type = view.getUint16(e + 2, le);
      const n = view.getUint32(e + 4, le);
      const size = (TYPE_SIZE[type] ?? 1) * n;
      const at = size <= 4 ? e + 8 : view.getUint32(e + 8, le);
      need(at + size);
      if (type === 2) {
        tags.set(tag, String.fromCharCode(...buf.subarray(at, at + n)).replace(/\0+$/, ""));
      } else {
        const step = TYPE_SIZE[type] ?? 1;
        tags.set(tag, Array.from({ length: n }, (_, k) => read(type, at + k * step)));
      }
    }
    const num = (tag: number, fallback?: number) => {
      const v = tags.get(tag);
      if (Array.isArray(v) && v.length) return v[0];
      if (fallback !== undefined) return fallback;
      throw new Error(`COG is missing TIFF tag ${tag}`);
    };
    const bits = num(258, 1);
    const samples = num(277, 1);
    if (bits !== 8 || samples !== 1) throw new Error("Only single-band 8-bit COGs are supported");
    if (!tags.has(322) || !tags.has(324)) throw new Error("Only tiled COGs are supported");

    levels.push({
      width: num(256),
      height: num(257),
      tileWidth: num(322),
      tileHeight: num(323),
      tileOffsets: tags.get(324) as number[],
      tileByteCounts: tags.get(325) as number[],
      compression: num(259, 1),
      predictor: num(317, 1),
    });

    if (!origin) {
      const scale = tags.get(33550) as number[] | undefined;
      const tie = tags.get(33922) as number[] | undefined;
      if (scale && tie) {
        pixelSize = [scale[0], scale[1]];
        // Tie point: raster (I, J) ↔ model (X, Y); move it back to the raster's (0, 0) corner.
        origin = [tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1]];
      }
      const nd = tags.get(42113);
      if (typeof nd === "string" && nd.trim() !== "" && Number.isFinite(Number(nd))) noData = Number(nd);
    }
    ifd = view.getUint32(ifd + 2 + count * 12, le);
  }

  if (!levels.length || !origin || !pixelSize) throw new Error("COG has no georeferenced image");
  return { levels, origin, pixelSize, noData };
}

/** Byte range of one tile, or null for an empty (sparse) tile. */
export function tileRange(level: CogLevel, tx: number, ty: number): { offset: number; length: number } | null {
  const across = Math.ceil(level.width / level.tileWidth);
  const i = ty * across + tx;
  const length = level.tileByteCounts[i] ?? 0;
  if (!length) return null;
  return { offset: level.tileOffsets[i], length };
}

/** Decompresses a tile into one byte per pixel (row-major, tileWidth × tileHeight). */
export function decodeTile(level: CogLevel, bytes: Uint8Array): Uint8Array {
  let raw: Uint8Array;
  if (level.compression === 1) raw = bytes;
  else if (level.compression === 8 || level.compression === 32946) raw = new Uint8Array(inflateSync(bytes));
  else throw new Error(`Unsupported COG compression ${level.compression}`);

  const expected = level.tileWidth * level.tileHeight;
  if (raw.length < expected) throw new Error("COG tile is shorter than expected");
  if (level.predictor === 2) {
    for (let y = 0; y < level.tileHeight; y++) {
      const row = y * level.tileWidth;
      for (let x = 1; x < level.tileWidth; x++) raw[row + x] = (raw[row + x] + raw[row + x - 1]) & 0xff;
    }
  } else if (level.predictor !== 1) {
    throw new Error(`Unsupported COG predictor ${level.predictor}`);
  }
  return raw.subarray(0, expected);
}
