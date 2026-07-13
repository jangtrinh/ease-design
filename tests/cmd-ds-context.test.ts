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

function initDs(tmp: string, bare = false) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "landing for a gym",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
    ...(bare ? ["--bare"] : []),
  ]);
}

// ─── ds context ──────────────────────────────────────────────────────────────

describe("ui ds context", () => {
  it("round-trip: output starts with # Design System: and contains persona slug", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^# Design System: acme/);
    expect(r.stdout).toContain("liquid-glass");
  });

  it("--format json returns structured object with semantic tokens", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp, true); // --bare: keep the registry empty so this test stays focused on tokens
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const ctx = JSON.parse(r.stdout).data;
    expect(ctx.semantic.length).toBeGreaterThan(10);
    expect(ctx.registry).toHaveLength(0);
  });

  it("--include tokens emits only the tokens section", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "tokens"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("## Tokens");
    expect(r.stdout).not.toContain("## Registered components");
    expect(r.stdout).not.toContain("## Naming rules");
  });

  it("--max-bytes 600 truncates output to at most 600 bytes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "600"]);
    expect(r.exitCode).toBe(0);
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(600);
  });

  it("--format json --max-bytes 100 exits 0 with valid JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--max-bytes", "100"]);
    expect(r.exitCode).toBe(0);
    // Output must be parseable JSON (not truncated mid-string)
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it("--strict adds enforcement preamble referencing tokens below", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--strict"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ENFORCEMENT");
    expect(r.stdout).toContain("tokens below");
    expect(r.stdout).not.toContain("tokens above");
  });

  it("errors DS_TAMPERED when tokens file is hand-edited", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const tokensPath = join(tmp, "design", "design.tokens.json");
    writeFileSync(tokensPath, '{"color":{"primary":{"$value":"#FF0000","$type":"color"}}}\n');
    const r = capture(["ds", "context", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_TAMPERED");
  });

  it("errors DS_NOT_FOUND when no DS exists in directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-empty-"));
    const r = capture(["ds", "context", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_NOT_FOUND");
  });

  it("errors BAD_ARG for invalid --include value", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "colors", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("errors BAD_ARG for non-numeric --max-bytes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "abc", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("semantic tokens remain in context after change-token converts alias → literal", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);

    // Sanity: color.primary starts as a semantic alias and appears in context
    const before = capture(["ds", "context", "--dir", tmp]);
    expect(before.exitCode).toBe(0);
    expect(before.stdout).toMatch(/\| color\.primary\s+\|/);

    // Mutate to a literal hex via change-token (the only sanctioned mutation)
    const ct = capture([
      "ds", "change-token", "color.primary",
      "--value", "#FF0066",
      "--dir", tmp,
    ]);
    expect(ct.exitCode, `change-token failed: ${ct.stderr}`).toBe(0);

    // Bug regression: post-mutation context MUST still list color.primary.
    // Without the $extensions.ease.layer marker, the alias-shape filter would
    // drop the token and the host model would lose its semantic primary.
    const after = capture(["ds", "context", "--dir", tmp]);
    expect(after.exitCode).toBe(0);
    expect(after.stdout, "color.primary must remain in context after change-token").toMatch(
      /\| color\.primary\s+\|/,
    );
    expect(after.stdout, "the new literal value must be visible to the host model").toContain(
      "#FF0066",
    );
  });
});
