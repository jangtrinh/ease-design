import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";

const PERSONA_DATA = new URL(
  "../knowledge/personas/personas.json",
  import.meta.url,
).pathname;

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

// ─── DS round-trip ────────────────────────────────────────────────────────────

describe("DS round-trip", () => {
  it("init → context → registry add (reseals) → context still clean (spec 009 P1)", () => {
    // Pre-spec-009-P1 this ended in DS_TAMPERED: 'registry register' wrote the registry
    // without ever touching the manifest, so the hash the manifest claimed and the bytes
    // on disk immediately diverged. 'registry register' now reseals (src/core/ds-reseal.ts)
    // — this round-trip is the fix's own regression guard.
    const tmp = mkdtempSync(join(tmpdir(), "ease-rt-"));

    // 1. init (--bare: this test asserts an empty registry, then registers one component)
    let r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "landing for a gym",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--bare",
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const initData = JSON.parse(r.stdout).data;
    expect(initData.generation).toBe(1);
    expect(initData.compiledHash).toMatch(/^sha256-/);

    // 2. context — markdown
    r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^# Design System: acme/);
    expect(r.stdout).toContain("color.primary");

    // 3. context — structured JSON
    r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const ctx = JSON.parse(r.stdout).data;
    expect(ctx.semantic.length).toBeGreaterThan(10);
    expect(ctx.registry).toHaveLength(0);

    // 4. Add a component via registry register (reseals: registry + manifest together)
    const markupFile = join(tmp, "btn.html");
    writeFileSync(markupFile, '<button class="btn">Click</button>');
    r = capture([
      "registry", "register", "Button/Primary",
      "--category", "interactive",
      "--markup", markupFile,
      "--tokens", "color.primary,radius.button",
      "--file", join(tmp, "design", "component-registry.json"),
      "--json",
    ]);
    expect(r.exitCode).toBe(0);

    // 5. context (and status) stay clean — the seal was never broken.
    r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const ctxAfter = JSON.parse(r.stdout).data;
    expect(ctxAfter.registry).toHaveLength(1);
    expect(ctxAfter.registry[0].name).toBe("Button/Primary");

    r = capture(["ds", "status", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.generation).toBe(2); // init(1) + register(2)
  });

  it("init → change-token → context shows new value; idempotent no-op", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-rt-"));

    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "test",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
    ]);

    // Change
    let r = capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.generation).toBe(2);
    expect(JSON.parse(r.stdout).data.changed).toBe(true);

    // Idempotent — same value again
    r = capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.changed).toBe(false);
    expect(JSON.parse(r.stdout).data.generation).toBe(2);

    // context still works after change
    r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("color.primary");
  });
});
