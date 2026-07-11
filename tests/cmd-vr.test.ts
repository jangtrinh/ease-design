/**
 * `ui vr` — E2E over the CLI (diff/gate/accept). Writes real .png fixtures to
 * a temp dir with encodePng, drives them through run(), and asserts exit
 * codes + --json envelopes (error codes always live on stdout, see errJson).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { decodePng, encodePng } from "../src/core/png-codec.js";
import type { RgbaImage } from "../src/core/png-codec.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

function solidImage(width: number, height: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function withBlock(img: RgbaImage): RgbaImage {
  const out: RgbaImage = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let y = 6; y < 12; y++) {
    for (let x = 6; x < 12; x++) {
      const i = (y * out.width + x) * 4;
      out.data[i] = 0; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255;
    }
  }
  return out;
}

let dir: string;
const writePng = (name: string, img: RgbaImage, atDir = dir): string => {
  const p = join(atDir, name);
  writeFileSync(p, encodePng(img));
  return p;
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-vr-")); });

const BASE_IMG = solidImage(20, 20, 200, 200, 200);
const CHANGED_IMG = withBlock(BASE_IMG);

describe("ui vr diff", () => {
  it("identical images → exit 0; --json diffPixels 0", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", solidImage(20, 20, 200, 200, 200));
    const r = capture(["vr", "diff", base, head, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { diffPixels: number; regression: boolean };
    expect(d.diffPixels).toBe(0);
    expect(d.regression).toBe(false);
  });

  it("a changed block → exit 1 (regression, default max-ratio 0); --json regression true", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", CHANGED_IMG);
    const r = capture(["vr", "diff", base, head, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { diffPixels: number; regression: boolean };
    expect(d.diffPixels).toBeGreaterThan(0);
    expect(d.regression).toBe(true);
  });

  it("--max-ratio 1 on a changed image → exit 0 (tolerated)", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", CHANGED_IMG);
    const r = capture(["vr", "diff", base, head, "--max-ratio", "1", "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { regression: boolean };
    expect(d.regression).toBe(false);
  });

  it("--out writes a decodable diff PNG", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", CHANGED_IMG);
    const outPath = join(dir, "diff.png");
    const r = capture(["vr", "diff", base, head, "--out", outPath]);
    expect(r.code).toBe(1);
    const decoded = decodePng(readFileSync(outPath));
    expect(decoded.width).toBe(20);
    expect(decoded.height).toBe(20);
  });

  it("missing positional → BAD_ARG", () => {
    const base = writePng("base.png", BASE_IMG);
    const r = capture(["vr", "diff", base, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("missing file → FILE_NOT_FOUND", () => {
    const base = writePng("base.png", BASE_IMG);
    const r = capture(["vr", "diff", base, join(dir, "nope.png"), "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("FILE_NOT_FOUND");
  });

  it("a non-PNG file → BAD_PNG", () => {
    const base = writePng("base.png", BASE_IMG);
    const notPng = join(dir, "notpng.png");
    writeFileSync(notPng, "this is not a png file");
    const r = capture(["vr", "diff", base, notPng, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_PNG");
  });

  it("bad --mask → BAD_MASK", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", CHANGED_IMG);
    const r = capture(["vr", "diff", base, head, "--mask", "1,2,3", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_MASK");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const base = writePng("base.png", BASE_IMG);
    const head = writePng("head.png", CHANGED_IMG);
    const r = capture(["vr", "diff", base, head, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("UNKNOWN_FLAG");
  });
});

describe("ui vr gate", () => {
  it("all-match dir pair → exit 0", () => {
    const baseDir = join(dir, "baseline"); mkdirSync(baseDir);
    const curDir = join(dir, "current"); mkdirSync(curDir);
    writePng("a.png", BASE_IMG, baseDir);
    writePng("a.png", solidImage(20, 20, 200, 200, 200), curDir);
    const r = capture(["vr", "gate", baseDir, curDir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { regressions: number };
    expect(d.regressions).toBe(0);
  });

  it("one changed file → exit 1, listed as a regression in --json entries", () => {
    const baseDir = join(dir, "baseline"); mkdirSync(baseDir);
    const curDir = join(dir, "current"); mkdirSync(curDir);
    writePng("a.png", BASE_IMG, baseDir);
    writePng("a.png", CHANGED_IMG, curDir);
    const r = capture(["vr", "gate", baseDir, curDir, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { regressions: number; entries: { name: string; status: string }[] };
    expect(d.regressions).toBeGreaterThan(0);
    const entry = d.entries.find((e) => e.name === "a.png");
    expect(entry?.status).toBe("changed");
  });

  it("a baseline file absent from current → status missing-current (regression)", () => {
    const baseDir = join(dir, "baseline"); mkdirSync(baseDir);
    const curDir = join(dir, "current"); mkdirSync(curDir);
    writePng("a.png", BASE_IMG, baseDir);
    writePng("b.png", BASE_IMG, baseDir);
    writePng("a.png", solidImage(20, 20, 200, 200, 200), curDir);
    const r = capture(["vr", "gate", baseDir, curDir, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { entries: { name: string; status: string }[] };
    const entry = d.entries.find((e) => e.name === "b.png");
    expect(entry?.status).toBe("missing-current");
  });

  it("a current file with no baseline → status new, NOT a failure on its own (exit 0)", () => {
    const baseDir = join(dir, "baseline"); mkdirSync(baseDir);
    const curDir = join(dir, "current"); mkdirSync(curDir);
    writePng("a.png", BASE_IMG, baseDir);
    writePng("a.png", solidImage(20, 20, 200, 200, 200), curDir);
    writePng("b.png", BASE_IMG, curDir); // extra render, no baseline
    const r = capture(["vr", "gate", baseDir, curDir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { regressions: number; entries: { name: string; status: string }[] };
    expect(d.regressions).toBe(0);
    const entry = d.entries.find((e) => e.name === "b.png");
    expect(entry?.status).toBe("new");
  });
});

describe("ui vr accept", () => {
  it("copies pngs, exit 0, --json accepted count matches; then gate passes", () => {
    const curDir = join(dir, "current"); mkdirSync(curDir);
    const baseDir = join(dir, "baseline");
    writePng("a.png", BASE_IMG, curDir);
    writePng("b.png", CHANGED_IMG, curDir);

    const acceptResult = capture(["vr", "accept", curDir, baseDir, "--json"]);
    expect(acceptResult.code).toBe(0);
    const acceptData = JSON.parse(acceptResult.out).data as { accepted: number; files: string[] };
    expect(acceptData.accepted).toBe(2);
    expect(acceptData.files.sort()).toEqual(["a.png", "b.png"]);

    const gateResult = capture(["vr", "gate", baseDir, curDir, "--json"]);
    expect(gateResult.code).toBe(0);
    const gateData = JSON.parse(gateResult.out).data as { regressions: number };
    expect(gateData.regressions).toBe(0);
  });
});

describe("ui vr — no subcommand", () => {
  it("no subcommand → BAD_ARG", () => {
    const r = capture(["vr", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });
});
