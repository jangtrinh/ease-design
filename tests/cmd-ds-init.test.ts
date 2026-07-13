import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// ─── ds init ─────────────────────────────────────────────────────────────────

describe("ui ds init", () => {
  it("writes three artifacts and returns generation=1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "landing for a gym",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.generation).toBe(1);
    expect(data.compiledHash).toMatch(/^sha256-/);
    expect(data.tokenCount).toBeGreaterThanOrEqual(95);
  });

  it("manifest compiledHash equals canonicalHash of the written tokens file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "test",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    const data = JSON.parse(r.stdout).data;
    const tokensRaw = readFileSync(join(tmp, "design", "design.tokens.json"), "utf8");
    const tokensObj = JSON.parse(tokensRaw);
    expect(data.compiledHash).toBe(canonicalHash(tokensObj));
  });

  it("errors DS_EXISTS on second init without --force", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--json",
    ]);
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_EXISTS");
  });

  it("--force overwrites; generation resets to 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA,
    ]);
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--force", "--json",
    ]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.generation).toBe(1);
  });

  it("--force preserves prior changelog: prior init + change-token entries survive re-init", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    // First init
    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "first intent",
      "--dir", tmp, "--persona-data", PERSONA_DATA,
    ]);
    // Make a change-token mutation (adds a change-token changelog entry)
    capture([
      "ds", "change-token", "color.primary",
      "--value", "{primary.600}",
      "--dir", tmp,
    ]);
    // Force re-init with different intent
    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "second intent",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--force",
    ]);
    // Read the manifest directly to inspect changelog
    const manifestPath = join(tmp, "design", "ds.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    // Changelog must contain: prior init, prior change-token, new init — in that order
    expect(manifest.changelog.length).toBeGreaterThanOrEqual(3);
    expect(manifest.changelog[0]?.kind).toBe("init");
    expect(manifest.changelog[1]?.kind).toBe("change-token");
    expect(manifest.changelog[manifest.changelog.length - 1]?.kind).toBe("init");
    // Last init note must reference the re-init persona, not the prior intent
    const lastEntry = manifest.changelog[manifest.changelog.length - 1];
    expect(lastEntry?.note).toContain("liquid-glass");
  });

  it("errors DS_EXISTS when manifest already exists at write time (wx guard)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-wx-"));
    // Pre-create the design directory and manifest file without going through 'ds init'
    mkdirSync(join(tmp, "design"), { recursive: true });
    writeFileSync(join(tmp, "design", "ds.manifest.json"), '{"stub":true}\n', "utf8");
    // Now run 'ds init' without --force — should hit the wx guard and return DS_EXISTS
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_EXISTS");
  });

  it("errors PERSONA_NOT_FOUND for unknown slug", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "banana-republic",
      "--intent", "test",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("PERSONA_NOT_FOUND");
  });

  it("errors BAD_BRAND_HEX for malformed hex", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "test",
      "--brand-hex", "#1",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_BRAND_HEX");
  });

  it("errors BAD_NAME for invalid name pattern", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "UPPER_CASE",
      "--persona", "liquid-glass",
      "--intent", "test",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_NAME");
  });

  it("errors BAD_INTENT when --intent is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.error.code).toBe("BAD_INTENT");
  });
});

// ─── ds init — ships the mature component kit (P2a + P2b) ──────────────────────

describe("ui ds init — ships the component kit (P2a + P2b)", () => {
  function initKit(tmp: string, bare = false): void {
    capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA,
      ...(bare ? ["--bare"] : []),
    ]);
  }
  function readComponents(tmp: string): { name: string; status?: string }[] {
    const raw = readFileSync(join(tmp, "design", "component-registry.json"), "utf8");
    return (JSON.parse(raw).components ?? []) as { name: string; status?: string }[];
  }

  it("a fresh init registers the 21 kit components (all stable)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-kit-"));
    initKit(tmp);
    const comps = readComponents(tmp);
    expect(comps.map((c) => c.name)).toEqual([
      "Control/Button", "Control/Checkbox", "Control/Input", "Control/Radio",
      "Control/Select", "Control/Switch", "Control/Textarea",
      "Data/Table",
      "Display/Alert", "Display/Avatar", "Display/Badge", "Display/Card",
      "Display/Kbd", "Display/Progress", "Display/Separator", "Display/Skeleton",
      "Display/Toast",
      "Form/Field",
      "Overlay/Dialog", "Overlay/Tooltip",
      "Structure/Tabs",
    ]);
    expect(comps.every((c) => c.status === "stable")).toBe(true);
  });

  it("--bare keeps the registry empty (legacy behaviour)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-bare-"));
    initKit(tmp, true);
    expect(readComponents(tmp)).toHaveLength(0);
  });

  it("manifest registryHash reflects the kit-populated registry on disk", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-kithash-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test",
      "--dir", tmp, "--persona-data", PERSONA_DATA, "--json",
    ]);
    const data = JSON.parse(r.stdout).data;
    const regRaw = readFileSync(join(tmp, "design", "component-registry.json"), "utf8");
    expect(data.registryHash).toBe(canonicalHash(JSON.parse(regRaw)));
  });

  it("a freshly compiled DS passes 'ds specimen --strict' with 0 errors and 0 warnings", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-init-spec-"));
    initKit(tmp);
    const r = capture(["ds", "specimen", "--dir", tmp, "--strict", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data as { errorCount: number; warningCount: number; stateful: number };
    expect(data.errorCount).toBe(0);
    expect(data.warningCount).toBe(0);
    // 18 of the 21 declare >=1 normalized state; Avatar/Separator/Kbd are static primitives
    // (State=Static → no normalized state) so they do not join the specimen state contract.
    expect(data.stateful).toBe(18);
  });
});
