/**
 * Deterministic screenshot diff (DESIGN-OS T5) — a zero-dependency port of the
 * pixelmatch algorithm (YIQ perceptual colour delta + anti-aliasing detection),
 * plus rectangular masks for known-dynamic regions (timestamps, avatars). Pure
 * function of two RGBA buffers; no browser, no network. The binary never renders
 * — figma-agent/preview produces the PNGs, this only compares them.
 */
import type { RgbaImage } from "./png-codec.js";

export interface Mask {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DiffOptions {
  /** 0–1 matching tolerance; larger = more permissive. pixelmatch default 0.1. */
  threshold?: number;
  /** Count anti-aliased pixels as real differences (default false — they're flake). */
  includeAA?: boolean;
  /** Rectangles to ignore (dynamic content). */
  masks?: Mask[];
}
export interface DiffResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  /** diffPixels / totalPixels, 0–1. */
  diffRatio: number;
  /** RGBA diff image: unchanged pixels dimmed, AA yellow, real diffs red. */
  diff: RgbaImage;
  dimensionMismatch?: { base: [number, number]; head: [number, number] };
}

const MAX_YIQ = 35215; // max possible YIQ delta for opaque 8-bit colours

/** In-bounds byte read; every index is bounded by loop invariants (see diffImages). */
const rd = (b: Uint8Array, i: number): number => b[i] as number;

const rgb2y = (r: number, g: number, b: number): number => r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
const rgb2i = (r: number, g: number, b: number): number => r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
const rgb2q = (r: number, g: number, b: number): number => r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
const blend = (c: number, a: number): number => 255 + (c - 255) * a;

/** Signed YIQ colour delta between pixel `k` of `a` and pixel `m` of `b` (over white). */
function colorDelta(a: Uint8Array, b: Uint8Array, k: number, m: number, yOnly: boolean): number {
  let r1 = rd(a, k), g1 = rd(a, k + 1), b1 = rd(a, k + 2);
  let r2 = rd(b, m), g2 = rd(b, m + 1), b2 = rd(b, m + 2);
  const a1 = rd(a, k + 3), a2 = rd(b, m + 3);
  if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;
  if (a1 < 255) { const af = a1 / 255; r1 = blend(r1, af); g1 = blend(g1, af); b1 = blend(b1, af); }
  if (a2 < 255) { const af = a2 / 255; r2 = blend(r2, af); g2 = blend(g2, af); b2 = blend(b2, af); }
  const y = rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2);
  if (yOnly) return y;
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  return y > 0 ? -delta : delta; // sign encodes lighter/darker (used by AA detection)
}

/** pixelmatch anti-aliasing heuristic: is pixel (x1,y1) of `img` on an AA edge absent from `other`? */
function antialiased(img: Uint8Array, x1: number, y1: number, width: number, height: number, other: Uint8Array): boolean {
  const x0 = Math.max(x1 - 1, 0), y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1), y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0, max = 0, minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);
      if (delta === 0) { if (++zeroes > 2) return false; }
      else if (delta < min) { min = delta; minX = x; minY = y; }
      else if (delta > max) { max = delta; maxX = x; maxY = y; }
    }
  }
  if (min === 0 || max === 0) return false;
  return (hasManySiblings(img, minX, minY, width, height) && hasManySiblings(other, minX, minY, width, height)) ||
    (hasManySiblings(img, maxX, maxY, width, height) && hasManySiblings(other, maxX, maxY, width, height));
}

/** ≥3 adjacent pixels of identical colour → part of a solid region, not an AA edge. */
function hasManySiblings(img: Uint8Array, x1: number, y1: number, width: number, height: number): boolean {
  const x0 = Math.max(x1 - 1, 0), y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1), y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const p = (y * width + x) * 4;
      if (rd(img, pos) === rd(img, p) && rd(img, pos + 1) === rd(img, p + 1) && rd(img, pos + 2) === rd(img, p + 2) && rd(img, pos + 3) === rd(img, p + 3)) {
        if (++zeroes > 2) return true;
      }
    }
  }
  return false;
}

function isMasked(x: number, y: number, masks: Mask[]): boolean {
  for (const m of masks) if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
  return false;
}

const drawPixel = (out: Uint8Array, pos: number, r: number, g: number, b: number): void => {
  out[pos] = r; out[pos + 1] = g; out[pos + 2] = b; out[pos + 3] = 255;
};
const grayPixel = (img: Uint8Array, i: number): number => {
  const a = rd(img, i + 3) / 255;
  return 255 + (rgb2y(rd(img, i), rd(img, i + 1), rd(img, i + 2)) - 255) * (0.1 * a);
};

/** Diff two equal-size RGBA images. Unequal dimensions are a hard, whole-image regression. */
export function diffImages(base: RgbaImage, head: RgbaImage, opts: DiffOptions = {}): DiffResult {
  const threshold = opts.threshold ?? 0.1;
  const includeAA = opts.includeAA ?? false;
  const masks = opts.masks ?? [];

  if (base.width !== head.width || base.height !== head.height) {
    const w = Math.max(base.width, head.width), h = Math.max(base.height, head.height);
    const diff = { width: w, height: h, data: new Uint8Array(w * h * 4).fill(255) };
    return {
      width: w, height: h, diffPixels: w * h, totalPixels: w * h, diffRatio: 1, diff,
      dimensionMismatch: { base: [base.width, base.height], head: [head.width, head.height] },
    };
  }

  const { width, height } = base;
  const a = base.data, b = head.data;
  const out = new Uint8Array(width * height * 4);
  const maxDelta = MAX_YIQ * threshold * threshold;
  let diffPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = (y * width + x) * 4;
      if (isMasked(x, y, masks)) { drawPixel(out, pos, 200, 200, 200); continue; }
      const delta = colorDelta(a, b, pos, pos, false);
      if (Math.abs(delta) > maxDelta) {
        if (!includeAA && (antialiased(a, x, y, width, height, b) || antialiased(b, x, y, width, height, a))) {
          drawPixel(out, pos, 255, 255, 0); // AA edge → yellow, not counted
        } else {
          drawPixel(out, pos, 255, 0, 0); // real diff → red
          diffPixels++;
        }
      } else {
        const g = grayPixel(a, pos);
        drawPixel(out, pos, g, g, g);
      }
    }
  }
  const totalPixels = width * height;
  return { width, height, diffPixels, totalPixels, diffRatio: diffPixels / totalPixels, diff: { width, height, data: out } };
}
