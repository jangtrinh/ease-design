import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { levenshtein, findUnknownFlag, unknownFlagMessage } from "../src/core/flag-guard.js";
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

// ─── Unit ───────────────────────────────────────────────────────────────────────

describe("flag-guard — levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("brand-hex", "brand-hex")).toBe(0);
  });
  it("counts single-substitution distance", () => {
    expect(levenshtein("persona", "persina")).toBe(1);
  });
  it("brand-color → brand-hex is a small, typo-plausible distance", () => {
    // 'brand-' shared; only the 'color'/'hex' tail differs.
    expect(levenshtein("brand-color", "brand-hex")).toBeLessThanOrEqual(5);
  });
});

describe("flag-guard — findUnknownFlag", () => {
  it("returns null when all flags are known or global", () => {
    const flags = { persona: "x", intent: "y", json: true, help: false };
    expect(findUnknownFlag(flags, ["persona", "intent"])).toBeNull();
  });

  it("flags an unknown key and suggests the nearest known flag", () => {
    const res = findUnknownFlag({ "brand-color": "#fff" }, ["persona", "intent", "brand-hex", "dir"]);
    expect(res).not.toBeNull();
    expect(res?.flag).toBe("brand-color");
    expect(res?.suggestion).toBe("brand-hex");
  });

  it("omits a suggestion when nothing is close", () => {
    const res = findUnknownFlag({ zzzzzzzz: true }, ["persona", "intent"]);
    expect(res?.flag).toBe("zzzzzzzz");
    expect(res?.suggestion).toBeUndefined();
  });

  it("treats --json/--help/--version as always allowed", () => {
    expect(findUnknownFlag({ json: true, help: true, version: true }, [])).toBeNull();
  });

  it("message names the flag and folds in the did-you-mean hint", () => {
    const msg = unknownFlagMessage({ flag: "brand-color", suggestion: "brand-hex" });
    expect(msg).toContain("--brand-color");
    expect(msg).toContain("--brand-hex");
  });
});

// ─── Integration: the confirmed silent-no-op bug is now loud ─────────────────────

describe("flag-guard — ui ds init rejects unknown flags", () => {
  it("`ds init --brand-color` exits 1 with UNKNOWN_FLAG instead of silently dropping the seed", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fg-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "landing for a gym",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--brand-color", "#ff0066", // typo for --brand-hex
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout) as { error: { code: string; message: string } };
    expect(env.error.code).toBe("UNKNOWN_FLAG");
    expect(env.error.message).toContain("brand-hex");
  });

  it("the same call with the correct --brand-hex succeeds", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fg-"));
    const r = capture([
      "ds", "init", "acme",
      "--persona", "liquid-glass",
      "--intent", "landing for a gym",
      "--dir", tmp,
      "--persona-data", PERSONA_DATA,
      "--brand-hex", "#ff0066",
      "--json",
    ]);
    expect(r.exitCode, r.stdout).toBe(0);
  });
});

describe("flag-guard — ui init rejects unknown flags", () => {
  it("`ui init --runtimee` exits 1 with UNKNOWN_FLAG and suggests --runtime", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fg-init-"));
    const r = capture(["init", "--runtimee", "claude", "--cwd", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout) as { error: { code: string; message: string } };
    expect(env.error.code).toBe("UNKNOWN_FLAG");
    expect(env.error.message).toContain("runtime");
  });
});
