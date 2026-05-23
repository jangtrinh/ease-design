import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
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

function initDs(tmp: string) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "test",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
  ]);
}

// ─── ds status ────────────────────────────────────────────────────────────────

describe("ui ds status", () => {
  it("returns name, generation, persona, and token/component counts", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-status-"));
    initDs(tmp);
    const r = capture(["ds", "status", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.name).toBe("acme");
    expect(data.generation).toBe(1);
    expect(data.persona.slug).toBe("liquid-glass");
    expect(data.tokenCount).toBeGreaterThan(0);
    expect(data.componentCount).toBe(0);
    expect(data.compiledHash).toMatch(/^sha256-/);
  });

  it("errors DS_NOT_FOUND when no design system in directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-status-empty-"));
    const r = capture(["ds", "status", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_NOT_FOUND");
  });
});
