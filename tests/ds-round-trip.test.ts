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
  it("init → context → registry add → DS_TAMPERED (registry hash mismatch)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-rt-"));

    // 1. init
    let r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "landing for a gym",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
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

    // 4. Add a component via registry register (modifies component-registry.json)
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

    // 5. context now sees DS_TAMPERED because registry hash differs from manifest
    r = capture(["ds", "context", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_TAMPERED");
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
