/**
 * `ui ds set-role <token.path> <role>` — the owner-edit path for role recognition
 * (spec 011 Phase 2). Covers the reseal round-trip, the no-op branch, both
 * validation error codes (BAD_TOKEN / BAD_ROLE), and that a correction here is
 * what `ds context` later reads (cross-checked in cmd-ds-context.test.ts).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { loadManifest } from "../src/core/ds-manifest.js";

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

function writeFlat(dir: string, name: string, obj: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj), "utf8");
  return p;
}

function importDs(tmp: string): void {
  const src = writeFlat(tmp, "tokens.json", {
    color: { "surface-content": "#FFFFFF", "zorp-glimble": "#123456" },
  });
  const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
  expect(r.exitCode).toBe(0);
}

describe("ui ds set-role", () => {
  it("round-trip: sets a role, bumps generation, changed=true, changelog grows", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-"));
    importDs(tmp);
    // zorp-glimble is unrecognized by name — the owner names it explicitly.
    const r = capture(["ds", "set-role", "color.zorp-glimble", "popover", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.changed).toBe(true);
    expect(data.role).toBe("popover");
    expect(data.generation).toBe(2);

    const written = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    expect(written.color["zorp-glimble"].$extensions["design-os.role"]).toBe("popover");

    const manifest = loadManifest(join(tmp, "design", "ds.manifest.json"));
    expect(manifest.generation).toBe(2);
    expect(manifest.changelog.at(-1)).toMatchObject({
      kind: "set-role", path: "color.zorp-glimble", to: "popover",
    });
  });

  it("a correction overrides a role recognition already baked by 'ds import'", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-correct-"));
    importDs(tmp);
    // surface-content recognized as background by 'ds import' — the owner corrects it.
    const before = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    expect(before.color["surface-content"].$extensions["design-os.role"]).toBe("background");

    const r = capture(["ds", "set-role", "color.surface-content", "foreground", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.changed).toBe(true);

    const after = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    expect(after.color["surface-content"].$extensions["design-os.role"]).toBe("foreground");
    // Lossless: name and value untouched by the correction.
    expect(after.color["surface-content"].$value).toBe(before.color["surface-content"].$value);
  });

  it("no-op: setting the same role again → changed=false, generation unchanged", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-noop-"));
    importDs(tmp);
    const manifestPath = join(tmp, "design", "ds.manifest.json");
    const before = readFileSync(manifestPath);
    const r = capture(["ds", "set-role", "color.surface-content", "background", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.changed).toBe(false);
    expect(data.generation).toBe(1);
    const after = readFileSync(manifestPath);
    expect(after.equals(before)).toBe(true);
  });

  it("errors BAD_TOKEN for a non-existent token path", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-badtoken-"));
    importDs(tmp);
    const r = capture(["ds", "set-role", "color.nope", "background", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_TOKEN");
  });

  it("errors BAD_ROLE for an unknown role name", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-badrole-"));
    importDs(tmp);
    const r = capture(["ds", "set-role", "color.surface-content", "wobble", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ROLE");
  });

  it("errors BAD_ARG when <role> positional is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-noargs-"));
    importDs(tmp);
    const r = capture(["ds", "set-role", "color.surface-content", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("errors BAD_ARG for a non-two-level token path", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-onelevel-"));
    importDs(tmp);
    const r = capture(["ds", "set-role", "surface-content", "background", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("errors DS_NOT_FOUND when no design system exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-empty-"));
    const r = capture(["ds", "set-role", "color.primary", "primary", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_NOT_FOUND");
  });

  it("errors UNKNOWN_FLAG for a bogus flag", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-set-role-badflag-"));
    importDs(tmp);
    const r = capture(["ds", "set-role", "color.surface-content", "background", "--dir", tmp, "--bogus", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("UNKNOWN_FLAG");
  });
});
