/**
 * `png-codec` — zero-dependency 8-bit PNG codec used by `ui vr`.
 * Round-trip is the key property: encodePng(img) → decodePng(bytes) must
 * reproduce width/height/data exactly for every RGBA buffer we can build.
 */
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../src/core/png-codec.js";
import type { RgbaImage } from "../src/core/png-codec.js";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

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

function gradientImage(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 37) % 256;
      data[i + 1] = (y * 53) % 256;
      data[i + 2] = ((x + y) * 17) % 256;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function varyingAlphaImage(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 120;
      data[i + 1] = 60;
      data[i + 2] = 200;
      data[i + 3] = (x * 7 + y * 11) % 256;
    }
  }
  return { width, height, data };
}

/** Assert width/height/data survive an encodePng → decodePng round-trip exactly. */
function assertRoundTrip(img: RgbaImage): void {
  const bytes = encodePng(img);
  const decoded = decodePng(bytes);
  expect(decoded.width).toBe(img.width);
  expect(decoded.height).toBe(img.height);
  expect(decoded.data.length).toBe(img.data.length);
  expect(Array.from(decoded.data)).toEqual(Array.from(img.data));
}

describe("png-codec — round-trip", () => {
  it("round-trips a solid-colour image", () => {
    assertRoundTrip(solidImage(8, 8, 255, 0, 0));
  });

  it("round-trips a per-pixel gradient image", () => {
    assertRoundTrip(gradientImage(16, 16));
  });

  it("round-trips an image with varying alpha", () => {
    assertRoundTrip(varyingAlphaImage(12, 12));
  });

  it("round-trips a 1×1 image", () => {
    assertRoundTrip(solidImage(1, 1, 10, 20, 30, 40));
  });

  it("round-trips a non-square image (7×3)", () => {
    assertRoundTrip(gradientImage(7, 3));
  });

  it("round-trips a larger non-square image (32×5) across many scanlines", () => {
    assertRoundTrip(gradientImage(32, 5));
  });

  it("round-trips full-black and full-white extremes", () => {
    assertRoundTrip(solidImage(4, 4, 0, 0, 0, 255));
    assertRoundTrip(solidImage(4, 4, 255, 255, 255, 255));
  });

  it("round-trips fully transparent pixels (alpha 0)", () => {
    assertRoundTrip(solidImage(5, 5, 100, 150, 200, 0));
  });
});

describe("png-codec — structural / error behaviour", () => {
  it("encodePng emits a buffer starting with the PNG signature", () => {
    const bytes = encodePng(solidImage(2, 2, 1, 2, 3));
    expect(Array.from(bytes.subarray(0, 8))).toEqual(SIGNATURE);
  });

  it("decodePng throws on a bad signature (random bytes)", () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(() => decodePng(garbage)).toThrow(/signature/i);
  });
});
