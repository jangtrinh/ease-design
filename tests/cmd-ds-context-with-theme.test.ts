import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

function initDs(tmp: string) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "landing for a gym",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
  ]);
}

describe("ui ds context --with-theme", () => {
  it("markdown mode appends a fenced Tailwind @theme block after the context", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-wt-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--with-theme"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^# Design System: acme/); // context still first
    expect(r.stdout).toContain("## Design tokens — Tailwind v4 @theme");
    expect(r.stdout).toContain("```css");
    expect(r.stdout).toContain("@theme {");
  });

  it("without --with-theme there is no @theme block (regression guard)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-wt-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("@theme {");
  });

  it("--format json exposes the theme as a sibling string field", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-wt-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--with-theme", "--json"]);
    expect(r.exitCode).toBe(0);
    const ctx = JSON.parse(r.stdout).data as { theme?: string; semantic: unknown[] };
    expect(typeof ctx.theme).toBe("string");
    expect(ctx.theme).toContain("@theme {");
    expect(Array.isArray(ctx.semantic)).toBe(true);
  });

  it("the @theme block is immune to --max-bytes truncation of the context", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-wt-"));
    initDs(tmp);
    // A tiny budget truncates the context table but the theme is appended after.
    const r = capture(["ds", "context", "--dir", tmp, "--with-theme", "--max-bytes", "400"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("@theme {");
    // The theme carries many tokens, so total output far exceeds the 400-byte cap.
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeGreaterThan(400);
  });

  it("the emitted @theme matches `ui tokens compile --target tailwind`", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-wt-"));
    initDs(tmp);
    const compiled = capture([
      "tokens", "compile", join(tmp, "design", "design.tokens.json"), "--target", "tailwind",
    ]);
    expect(compiled.exitCode).toBe(0);
    const ctx = capture(["ds", "context", "--dir", tmp, "--with-theme"]);
    // The context's fenced theme must contain exactly the compiler's @theme body.
    expect(ctx.stdout).toContain(compiled.stdout.trim());
  });
});
