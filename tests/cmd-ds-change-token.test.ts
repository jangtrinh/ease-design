import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { loadManifest } from "../src/core/ds-manifest.js";

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

// ─── ds change-token ─────────────────────────────────────────────────────────

describe("ui ds change-token", () => {
  it("round-trip: changes value, bumps generation to 2, changed=true", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.generation).toBe(2);
    expect(data.changed).toBe(true);
    expect(data.compiledHash).toMatch(/^sha256-/);

    // Verify manifest on disk
    const manifest = loadManifest(join(tmp, "design", "ds.manifest.json"));
    expect(manifest.generation).toBe(2);
    expect(manifest.compiledHash).toBe(data.compiledHash);
  });

  it("no-op: same value → changed=false, generation unchanged, manifest bytes identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    // First change
    capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
    ]);
    const manifestPath = join(tmp, "design", "ds.manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    // Same value again
    const r = capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.changed).toBe(false);
    expect(data.generation).toBe(2);
    // Manifest must not have been touched
    const manifestAfter = readFileSync(manifestPath);
    expect(manifestAfter.equals(manifestBefore)).toBe(true);
  });

  it("errors TOKEN_NOT_FOUND for non-existent path", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.nope",
      "--value", "#FF0000",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("TOKEN_NOT_FOUND");
  });

  it("errors ALIAS_CYCLE for self-referential alias", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.text-body",
      "--value", "{color.text-body}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("ALIAS_CYCLE");
  });

  it("errors DANGLING_ALIAS for alias to a missing token", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.primary",
      "--value", "{not.real}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DANGLING_ALIAS");
  });

  it("errors BAD_VALUE for dimension value on color token", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.primary",
      "--value", "16px",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_VALUE");
  });

  it("errors BAD_VALUE for composite token (typography) with literal value", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    // text.body is typography (composite) — any value, alias or literal, must be rejected
    const r = capture([
      "ds", "change-token", "text.body",
      "--value", "#FF0000",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_VALUE");
  });

  it("changelog grows: 3 successive changes append 3 entries", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    capture(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--dir", tmp]);
    capture(["ds", "change-token", "color.primary", "--value", "{primary.400}", "--dir", tmp]);
    capture(["ds", "change-token", "color.primary", "--value", "{primary.500}", "--dir", tmp]);

    const manifest = loadManifest(join(tmp, "design", "ds.manifest.json"));
    // 1 init entry + 3 change-token entries
    expect(manifest.changelog).toHaveLength(4);
    expect(manifest.changelog.filter((e) => e.kind === "change-token")).toHaveLength(3);
  });

  it("errors BAD_ARG when --value is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "color.primary",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("errors BAD_VALUE for composite token alias form (typography cannot be aliased via CLI)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-"));
    initDs(tmp);
    const r = capture([
      "ds", "change-token", "text.body",
      "--value", "{text.heading}",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_VALUE");
  });

  it("errors DS_NOT_FOUND when no design system in directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ct-empty-"));
    const r = capture([
      "ds", "change-token", "color.primary",
      "--value", "#FF0000",
      "--dir", tmp,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_NOT_FOUND");
  });
});
