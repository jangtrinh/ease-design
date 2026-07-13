import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { checkTokenContrast, parsePairs } from "../src/core/ds-a11y.js";
import type { ResolvedToken } from "../src/core/token-model.js";

const tok = (path: string, value: string): ResolvedToken => ({ path, type: "color", value });

// ─── pure ────────────────────────────────────────────────────────────────────

describe("ds-a11y — checkTokenContrast", () => {
  const tokens = [
    tok("text.body", "#111111"),
    tok("text.muted", "#8A909C"), // ~3.2:1 on white — the recurring trap
    tok("bg.default", "#FFFFFF"),
    tok("color.disabled", "#CCCCCC"), // exempt role — not paired
  ];

  it("flags a muted-text-on-white pair below AA and passes strong text", () => {
    const r = checkTokenContrast(tokens);
    expect(r.inferred).toBe(true);
    const muted = r.pairs.find((p) => p.text === "text.muted" && p.surface === "bg.default")!;
    expect(muted.passesNormalText).toBe(false);
    expect(muted.ratio).toBeLessThan(4.5);
    const body = r.pairs.find((p) => p.text === "text.body")!;
    expect(body.passesNormalText).toBe(true);
    expect(r.failures.map((f) => f.text)).toContain("text.muted");
    expect(r.failures.map((f) => f.text)).not.toContain("text.body");
  });

  it("exempts disabled/inactive roles (never paired)", () => {
    const r = checkTokenContrast(tokens);
    expect(r.pairs.some((p) => p.text === "color.disabled" || p.surface === "color.disabled")).toBe(false);
  });

  it("explicit --pairs skip inference and are marked not-inferred", () => {
    const r = checkTokenContrast(tokens, [["text.muted", "bg.default"]]);
    expect(r.inferred).toBe(false);
    expect(r.checkedPairs).toBe(1);
    expect(r.failures).toHaveLength(1);
  });

  it("a non-hex or missing token lands in unresolved, never a false pass", () => {
    const r = checkTokenContrast([tok("text.body", "var(--x)"), tok("bg.default", "#FFF000")], [["text.body", "bg.default"]]);
    expect(r.unresolved).toContain("text.body:bg.default");
    expect(r.failures).toHaveLength(0);
  });

  it("parsePairs parses and rejects malformed entries", () => {
    expect(parsePairs("a:b, c:d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(() => parsePairs("a")).toThrow();
    expect(() => parsePairs("a:")).toThrow();
  });

  it("is deterministic", () => {
    expect(checkTokenContrast(tokens)).toEqual(checkTokenContrast(tokens));
  });

  // ── L5: inferred-mode `unresolved` respects $type ──────────────────────────
  it("(L5) a NON-color token whose NAME looks textish is never swept into unresolved", () => {
    const mixed: ResolvedToken[] = [
      { path: "typography-sizes.text-2xl", type: "dimension", value: "24px" }, // textish name, not a colour
      tok("text.body", "#111111"),
      tok("bg.default", "#FFFFFF"),
    ];
    const r = checkTokenContrast(mixed);
    expect(r.inferred).toBe(true);
    expect(r.unresolved).not.toContain("typography-sizes.text-2xl");
  });

  it("(L5) a COLOR token that looks textish but has no hex IS still reported unresolved", () => {
    const ghost: ResolvedToken[] = [
      tok("color.text-ghost", "{missing.alias}"), // colour-typed, textish, unresolved → no hex
      tok("bg.default", "#FFFFFF"),
    ];
    const r = checkTokenContrast(ghost);
    expect(r.inferred).toBe(true);
    expect(r.unresolved).toContain("color.text-ghost");
  });
});

// ─── command ─────────────────────────────────────────────────────────────────

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-a11y-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "design.tokens.json"), JSON.stringify({
    text: { body: { $value: "#111111", $type: "color" }, muted: { $value: "#8A909C", $type: "color" } },
    bg: { default: { $value: "#FFFFFF", $type: "color" } },
  }), "utf8");
});

describe("ui ds a11y", () => {
  it("exits 1 on an AA failure and never says 'accessible'", () => {
    const r = capture(["ds", "a11y", "--dir", dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("text.muted on bg.default");
    expect(r.out).toContain("not a conformance claim");
    expect(r.out.toLowerCase()).not.toMatch(/\baccessible\b|wcag aa compliant/);
  });

  it("--json returns failures + exit 1", () => {
    const r = capture(["ds", "a11y", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { failures: unknown[]; inferred: boolean };
    expect(d.failures.length).toBe(1);
    expect(d.inferred).toBe(true);
  });

  it("no tokens file → DS_NOT_FOUND", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-a11y-empty-"));
    const r = capture(["ds", "a11y", "--dir", empty, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_NOT_FOUND");
  });

  it("bad --pairs → BAD_ARG; unknown flag → UNKNOWN_FLAG", () => {
    expect(JSON.parse(capture(["ds", "a11y", "--dir", dir, "--pairs", "oops", "--json"]).out).error.code).toBe("BAD_ARG");
    expect(JSON.parse(capture(["ds", "a11y", "--dir", dir, "--nope", "--json"]).out).error.code).toBe("UNKNOWN_FLAG");
  });
});
