/**
 * `snapshot-diff` — pixelmatch-style perceptual diff used by `ui vr`.
 * Exercises identical/inverted/block-changed images, masks, dimension
 * mismatch, and threshold permissiveness — all against in-memory RgbaImages.
 */
import { describe, expect, it } from "vitest";
import { diffImages } from "../src/core/snapshot-diff.js";
import type { RgbaImage } from "../src/core/png-codec.js";

function solidImage(width: number, height: number, r: number, g: number, b: number, a = 255): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

function cloneImage(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

/** Paint a solid size×size square at (x0,y0) with the given colour. */
function setBlock(img: RgbaImage, x0: number, y0: number, size: number, r: number, g: number, b: number, a = 255): void {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
}

describe("snapshot-diff — core comparisons", () => {
  it("identical images → diffPixels 0, diffRatio 0", () => {
    const base = solidImage(10, 10, 128, 128, 128);
    const head = cloneImage(base);
    const r = diffImages(base, head);
    expect(r.diffPixels).toBe(0);
    expect(r.diffRatio).toBe(0);
  });

  it("fully inverted images (black vs white) → diffPixels === totalPixels, diffRatio 1", () => {
    const base = solidImage(10, 10, 0, 0, 0);
    const head = solidImage(10, 10, 255, 255, 255);
    const r = diffImages(base, head);
    expect(r.diffPixels).toBe(r.totalPixels);
    expect(r.diffRatio).toBe(1);
  });

  it("a solid changed block (≥3×3, interior) on a solid field → diffPixels > 0", () => {
    const base = solidImage(20, 20, 200, 200, 200);
    const head = cloneImage(base);
    setBlock(head, 7, 7, 6, 0, 0, 0); // 6×6 block, well clear of edges
    const r = diffImages(base, head);
    expect(r.diffPixels).toBeGreaterThan(0);
  });

  it("masks: masking exactly the changed region → diffPixels 0", () => {
    const base = solidImage(20, 20, 200, 200, 200);
    const head = cloneImage(base);
    setBlock(head, 5, 5, 8, 0, 0, 0);
    const r = diffImages(base, head, { masks: [{ x: 5, y: 5, w: 8, h: 8 }] });
    expect(r.diffPixels).toBe(0);
    expect(r.diffRatio).toBe(0);
  });

  it("masks: a partial mask that doesn't fully cover the change still leaves a diff", () => {
    const base = solidImage(20, 20, 200, 200, 200);
    const head = cloneImage(base);
    setBlock(head, 5, 5, 8, 0, 0, 0);
    // Mask only the top-left half of the changed 8×8 block.
    const r = diffImages(base, head, { masks: [{ x: 5, y: 5, w: 4, h: 4 }] });
    expect(r.diffPixels).toBeGreaterThan(0);
  });

  it("dimension mismatch → dimensionMismatch set with both sizes, diffRatio 1", () => {
    const base = solidImage(10, 10, 1, 2, 3);
    const head = solidImage(12, 10, 1, 2, 3);
    const r = diffImages(base, head);
    expect(r.dimensionMismatch).toEqual({ base: [10, 10], head: [12, 10] });
    expect(r.diffRatio).toBe(1);
    expect(r.diffPixels).toBe(r.totalPixels);
  });

  it("threshold: a small colour nudge counts as diff at threshold 0", () => {
    const base = solidImage(20, 20, 100, 100, 100);
    const head = cloneImage(base);
    setBlock(head, 8, 8, 4, 110, 100, 100); // small +10 R nudge, interior block
    const r = diffImages(base, head, { threshold: 0 });
    expect(r.diffPixels).toBeGreaterThan(0);
  });

  it("threshold: the same small nudge does not count as diff at threshold 1 (permissive)", () => {
    const base = solidImage(20, 20, 100, 100, 100);
    const head = cloneImage(base);
    setBlock(head, 8, 8, 4, 110, 100, 100);
    const r = diffImages(base, head, { threshold: 1 });
    expect(r.diffPixels).toBe(0);
    expect(r.diffRatio).toBe(0);
  });

  it("totalPixels equals width*height", () => {
    const base = solidImage(7, 3, 1, 1, 1);
    const head = cloneImage(base);
    const r = diffImages(base, head);
    expect(r.totalPixels).toBe(21);
  });

  it("the returned diff image has width*height*4 bytes", () => {
    const base = solidImage(9, 5, 1, 2, 3);
    const head = cloneImage(base);
    setBlock(head, 2, 1, 3, 250, 10, 10);
    const r = diffImages(base, head);
    expect(r.diff.data.length).toBe(r.width * r.height * 4);
    expect(r.diff.width).toBe(9);
    expect(r.diff.height).toBe(5);
  });

  it("diffRatio is diffPixels / totalPixels", () => {
    const base = solidImage(20, 20, 50, 50, 50);
    const head = cloneImage(base);
    setBlock(head, 7, 7, 6, 250, 250, 250);
    const r = diffImages(base, head);
    expect(r.diffRatio).toBeCloseTo(r.diffPixels / r.totalPixels, 10);
  });
});
