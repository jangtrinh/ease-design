import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { readMarkup } from "../src/core/registry-markup-reader.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);

// ─── File path branch ─────────────────────────────────────────────────────────

describe("readMarkup — file path", () => {
  it("reads content from an existing file", () => {
    const content = readMarkup(fix("registry-markup.html"));
    expect(content.length).toBeGreaterThan(0);
    // Fixture is a small HTML snippet — spot-check a known token
    expect(content).toContain("<button");
  });

  it("throws RegistryError FILE_NOT_FOUND for absent file", () => {
    expect(() => readMarkup("/nonexistent-markup-xyz.html")).toThrow();
    try {
      readMarkup("/nonexistent-markup-xyz.html");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("FILE_NOT_FOUND");
    }
  });
});

// ─── Stdin branch ("-") — injection-seam tests ───────────────────────────────
//
// The StdinReader injection seam lets us test the stdin code path without a
// subprocess or a pre-built binary. A synthetic reader returns canned bytes
// exactly as a real pipe would: one or more chunks followed by 0 (EOF).

describe("readMarkup — stdin sentinel \"-\"", () => {
  it("returns content written to the injected reader in a single chunk", () => {
    const markupContent = "<button>Stdin Button</button>";
    const encoded = Buffer.from(markupContent, "utf8");
    let called = false;

    // Synthetic reader: first call returns the full buffer, second call returns 0 (EOF).
    const syntheticReader = (buf: Buffer, offset: number, length: number): number => {
      if (called) return 0;
      called = true;
      const n = Math.min(encoded.length, length);
      encoded.copy(buf, offset, 0, n);
      return n;
    };

    const result = readMarkup("-", syntheticReader);
    expect(result).toBe(markupContent);
  });

  it("concatenates multiple chunks correctly (simulates chunked pipe)", () => {
    const part1 = "<div>";
    const part2 = "hello";
    const part3 = "</div>";
    const parts = [part1, part2, part3].map((p) => Buffer.from(p, "utf8"));
    let idx = 0;

    const syntheticReader = (buf: Buffer, offset: number, length: number): number => {
      const chunk = parts[idx];
      if (chunk === undefined) return 0;
      idx++;
      const n = Math.min(chunk.length, length);
      chunk.copy(buf, offset, 0, n);
      return n;
    };

    const result = readMarkup("-", syntheticReader);
    expect(result).toBe(part1 + part2 + part3);
  });

  it("returns empty string when reader signals EOF immediately", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const syntheticReader = (buf: Buffer, offset: number, length: number): number => 0;
    const result = readMarkup("-", syntheticReader);
    expect(result).toBe("");
  });

  it("throws RegistryError READ_ERROR when reader throws", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const failingReader = (buf: Buffer, offset: number, length: number): number => {
      throw new Error("pipe broken");
    };

    expect(() => readMarkup("-", failingReader)).toThrow();
    try {
      readMarkup("-", failingReader);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("READ_ERROR");
    }
  });
});
