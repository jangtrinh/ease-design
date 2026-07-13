// Render tests: launch REAL system Chrome and screenshot fixture pages to PNG.
// Gated behind hasChrome() so a runner without Chrome skips instead of hard-failing (same probe
// as the a11y-audit suite) — the "one run on real data before it's done" the dogfood rules demand.
import { describe, it, expect } from "vitest";
import { mkdtempSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { captureShots } from "../cli/src/shoot.ts";
import { okEnv } from "../cli/src/shot-envelope.ts";
import { hasChrome } from "./has-chrome.ts";

const fixture = (name: string): string => join(import.meta.dirname, "fixtures", name);
const outDir = (): string => mkdtempSync(join(tmpdir(), "page-shot-"));

describe.skipIf(!hasChrome())("captureShots (real Chrome)", () => {
  it("renders a fixture to a non-empty PNG and yields the envelope-ready shape", async () => {
    const out = outDir();
    const data = await captureShots([fixture("clean.html")], { outDir: out });
    expect(data.shots).toHaveLength(1);
    expect(data.errors).toEqual([]);
    expect(data.total).toBe(1);
    expect(data.out).toBe(out);

    const shot = data.shots[0]!;
    expect(shot.file).toBe("clean.png"); // stem of clean.html
    const path = join(out, shot.file);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(0); // non-empty PNG on disk
    expect(shot.bytes).toBe(statSync(path).size); // reported bytes == file size

    // Envelope shape mirrors the ui kernel: {ok, command, data}. errors empty → the CLI exits 0.
    expect(okEnv(data)).toEqual({ ok: true, command: "page-shot", data });
  });

  it("renders TWO targets to two distinct PNGs in input order", async () => {
    const out = outDir();
    const data = await captureShots([fixture("clean.html"), fixture("violations.html")], { outDir: out });
    expect(data.shots.map((s) => s.file)).toEqual(["clean.png", "violations.png"]);
    expect(data.total).toBe(2);
    expect(data.errors).toEqual([]);
    for (const s of data.shots) expect(statSync(join(out, s.file)).size).toBeGreaterThan(0);
  });

  it("records a bad target as an error entry (→ the CLI exits 1) without aborting the batch", async () => {
    const out = outDir();
    const data = await captureShots(
      [fixture("clean.html"), fixture("does-not-exist.html")],
      { outDir: out },
    );
    // The good target still rendered; the bad one is captured, not thrown.
    expect(data.shots.map((s) => s.file)).toEqual(["clean.png"]);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]!.target).toContain("does-not-exist.html");
    expect(data.errors[0]!.error.length).toBeGreaterThan(0);
    expect(data.total).toBe(2);
    // errors.length > 0 is exactly the CLI's exit-1 gate.
  });
});
