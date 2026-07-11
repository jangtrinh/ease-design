/**
 * Minimal, zero-dependency PNG codec (DESIGN-OS T5). Decodes/encodes 8-bit
 * non-interlaced PNGs into a flat RGBA buffer so `ui vr` can diff screenshots
 * with no npm image library. Uses only `node:zlib` (a Node builtin, not a
 * runtime dependency). Interlaced or 16-bit PNGs are rejected with a clear
 * error rather than mis-decoded — browser screenshots are always 8-bit,
 * non-interlaced, colour-type 2 (RGB) or 6 (RGBA).
 */
import { inflateSync, deflateSync } from "node:zlib";

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes/pixel, row-major, length = width*height*4. */
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** In-bounds byte read. Every index here is bounds-checked by loop invariants, so the
 * cast is safe and lets the hot loops stay clean under noUncheckedIndexedAccess. */
const rd = (b: Uint8Array, i: number): number => b[i] as number;

/** CRC-32 (IEEE), lazily-built table — used to validate/emit chunk CRCs. */
let CRC_TABLE: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (t[(c ^ rd(bytes, i)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PAETH = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decode an 8-bit non-interlaced PNG buffer into an RGBA image. Throws on unsupported forms. */
export function decodePng(buf: Uint8Array): RgbaImage {
  for (let i = 0; i < 8; i++) if (rd(buf, i) !== SIGNATURE[i]) throw new Error("not a PNG (bad signature)");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, colorType = -1;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | undefined;

  while (pos < buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(rd(buf, pos + 4), rd(buf, pos + 5), rd(buf, pos + 6), rd(buf, pos + 7));
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      const bitDepth = rd(body, 8);
      colorType = rd(body, 9);
      const interlace = rd(body, 12);
      if (interlace !== 0) throw new Error("interlaced PNG not supported (re-export non-interlaced)");
      if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (only 8-bit)`);
      if (![0, 2, 3, 6].includes(colorType)) throw new Error(`unsupported PNG colour type ${colorType}`);
    } else if (type === "PLTE") {
      palette = body.slice();
    } else if (type === "IDAT") {
      idat.push(body.slice());
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len; // length + type + data + crc
  }
  if (width === 0 || height === 0) throw new Error("PNG has no IHDR / zero dimensions");

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1; // 0=gray,3=palette-index → 1 sample
  const raw = inflateSync(concat(idat));
  const stride = width * channels;
  const pixels = unfilter(raw, width, height, channels, stride);
  return { width, height, data: toRgba(pixels, width, height, colorType, channels, palette) };
}

/** Reverse the per-scanline PNG filters into raw samples. */
function unfilter(raw: Uint8Array, width: number, height: number, channels: number, stride: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  const bpp = channels; // 8-bit → 1 byte/sample
  let inPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = rd(raw, inPos++);
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = rd(raw, inPos++);
      const a = x >= bpp ? rd(out, row + x - bpp) : 0;
      const b = y > 0 ? rd(out, prev + x) : 0;
      const c = y > 0 && x >= bpp ? rd(out, prev + x - bpp) : 0;
      let val: number;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + PAETH(a, b, c); break;
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      out[row + x] = val & 0xff;
    }
  }
  return out;
}

/** Expand decoded samples (gray / rgb / rgba / palette index) into RGBA. */
function toRgba(px: Uint8Array, width: number, height: number, colorType: number, channels: number, palette?: Uint8Array): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 6) { out[d] = rd(px, s); out[d + 1] = rd(px, s + 1); out[d + 2] = rd(px, s + 2); out[d + 3] = rd(px, s + 3); }
    else if (colorType === 2) { out[d] = rd(px, s); out[d + 1] = rd(px, s + 1); out[d + 2] = rd(px, s + 2); out[d + 3] = 255; }
    else if (colorType === 0) { const g = rd(px, s); out[d] = g; out[d + 1] = g; out[d + 2] = g; out[d + 3] = 255; }
    else { // palette index
      if (!palette) throw new Error("palette PNG missing PLTE chunk");
      const p = rd(px, s) * 3;
      out[d] = rd(palette, p); out[d + 1] = rd(palette, p + 1); out[d + 2] = rd(palette, p + 2); out[d + 3] = 255;
    }
  }
  return out;
}

/** Encode an RGBA image as an 8-bit colour-type-6 PNG (filter 0 on every row). */
export function encodePng(img: RgbaImage): Uint8Array {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    raw.set(data.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);
  const ihdr = new Uint8Array(13);
  const idv = new DataView(ihdr.buffer);
  idv.setUint32(0, width); idv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunks = [chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  return concat([new Uint8Array(SIGNATURE), ...chunks]);
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
