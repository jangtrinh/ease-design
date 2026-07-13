import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { canonicalHash } from "../src/core/ds-manifest.js";

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

function initDs(tmp: string, bare = false) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "test",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
    ...(bare ? ["--bare"] : []),
  ]);
}

// ─── ds status ────────────────────────────────────────────────────────────────

describe("ui ds status", () => {
  it("returns name, generation, persona, and token/component counts", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-status-"));
    initDs(tmp, true); // --bare: assert the empty-registry count mechanism
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

  // ─── lifecycle statusBreakdown (P4) ────────────────────────────────────────

  it("statusBreakdown is all-zero and text has no status suffix on an empty registry", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-status-empty-breakdown-"));
    initDs(tmp, true); // --bare: empty registry
    const rJson = capture(["ds", "status", "--dir", tmp, "--json"]);
    const data = JSON.parse(rJson.stdout).data;
    expect(data.statusBreakdown).toEqual({ stable: 0, beta: 0, draft: 0, unset: 0 });

    const rText = capture(["ds", "status", "--dir", tmp]);
    expect(rText.stdout).not.toContain(" stable /");
  });

  it("statusBreakdown counts statuses and text shows the suffix", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-status-breakdown-"));
    initDs(tmp);

    // Overwrite the registry with components spanning stable/beta/unset, then
    // re-sync the manifest's registryHash so loadDesignSystem's tamper check passes.
    const regPath = join(tmp, "design", "component-registry.json");
    const registry = {
      version: "0.1.0",
      components: [
        { name: "Button/Primary", category: "action", markup: "", tokensUsed: [], status: "stable" },
        { name: "Card/Pricing", category: "layout", markup: "", tokensUsed: [], status: "beta" },
        { name: "Chip/Filter", category: "action", markup: "", tokensUsed: [] },
      ],
    };
    writeFileSync(regPath, JSON.stringify(registry), "utf8");

    const manifestPath = join(tmp, "design", "ds.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.registryHash = canonicalHash(JSON.parse(readFileSync(regPath, "utf8")));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const rJson = capture(["ds", "status", "--dir", tmp, "--json"]);
    expect(rJson.exitCode).toBe(0);
    const data = JSON.parse(rJson.stdout).data;
    expect(data.componentCount).toBe(3);
    expect(data.statusBreakdown).toEqual({ stable: 1, beta: 1, draft: 0, unset: 1 });

    const rText = capture(["ds", "status", "--dir", tmp]);
    expect(rText.stdout).toContain("components: 3 (1 stable / 1 beta / 0 draft / 1 unset)");
  });
});
