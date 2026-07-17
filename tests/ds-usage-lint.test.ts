/**
 * `lintDsUsage` — the ENFORCEMENT-gate pure checker (spec 009).
 *
 * Canonical probe case first: the exact combination (undeclared var + hardcoded
 * hex) that was measured passing all four existing floors with zero errors —
 * this is the finding that motivated the linter, so it is the linter's own
 * first regression test (Art II/III).
 */
import { describe, expect, it } from "vitest";
import { lintDsUsage } from "../src/core/ds-usage-lint.js";

const DS_VARS = new Set(["--brand-primary"]);

describe("lintDsUsage — the motivating probe", () => {
  it("var(--totally-undeclared-token) + hardcoded hex → both errors, exit-bearing", () => {
    const html = `<html><head><style>
      .card { color: var(--totally-undeclared-token); background: #ff0000; }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.errorCount).toBe(2);
    expect(r.undeclaredTokenCount).toBe(1);
    expect(r.hardcodedColorCount).toBe(1);
    expect(r.findings.map((f) => f.checkId).sort()).toEqual(["hardcoded-color", "undeclared-token"]);
    expect(r.findings.every((f) => f.severity === "error")).toBe(true);
  });
});

describe("lintDsUsage — declaration-block strip (the two-arm out-A shape)", () => {
  it("DS pasted into :root + component CSS uses only var(--dsToken) → 0 findings", () => {
    const html = `<html><head><style>
      :root { --brand-primary: #3b82f6; }
      .card { color: var(--brand-primary); background: var(--brand-primary); }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.findings).toHaveLength(0);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
  });

  it("a hex literal INSIDE :root is never flagged (it IS the token definition)", () => {
    const html = `<html><head><style>
      :root { --brand-primary: #3b82f6; --other: #123456; }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.hardcodedColorCount).toBe(0);
  });
});

describe("lintDsUsage — off-system-token", () => {
  it("var(--surface-card) the page itself declares but the DS lacks → warning, not error", () => {
    const html = `<html><head><style>
      :root { --surface-card: var(--brand-primary); --brand-primary: #3b82f6; }
      .card { background: var(--surface-card); }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(1);
    expect(r.offSystemTokenCount).toBe(1);
    expect(r.findings[0]?.checkId).toBe("off-system-token");
    expect(r.findings[0]?.message).toContain("--surface-card");
    expect(r.findings[0]?.message).toContain("ui ds change-token");
  });

  it("a var() truly undeclared anywhere on the page → error, not warning", () => {
    const html = `<html><head><style>
      .card { background: var(--never-declared-anywhere); }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.errorCount).toBe(1);
    expect(r.undeclaredTokenCount).toBe(1);
    expect(r.findings[0]?.checkId).toBe("undeclared-token");
  });
});

describe("lintDsUsage — comments never trip a check", () => {
  it("a var() reference or hex mentioned only in a CSS comment is ignored", () => {
    const html = `<html><head><style>
      /* consumed via var(--token-name) rather than a hardcoded #ff0000 */
      .card { color: var(--brand-primary); }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.findings).toHaveLength(0);
  });
});

describe("lintDsUsage — colour-bearing property coverage", () => {
  it("flags rgb()/hsl() literals too, not just hex", () => {
    const html = `<html><head><style>
      .a { border-color: rgb(255, 0, 0); }
      .b { box-shadow: 0 1px 2px hsla(0, 0%, 0%, 0.4); }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.hardcodedColorCount).toBe(2);
  });

  it("v1 is colour-only: a hardcoded px/percent spacing or radius value is never flagged", () => {
    const html = `<html><head><style>
      .a { border-radius: 50%; padding: 12px; border-width: 1px; }
    </style></head><body></body></html>`;
    const r = lintDsUsage(html, { declaredVars: DS_VARS });
    expect(r.findings).toHaveLength(0);
  });
});

describe("lintDsUsage — determinism", () => {
  it("same input → byte-identical result", () => {
    const html = `<html><head><style>
      .card { color: var(--totally-undeclared-token); background: #ff0000; }
    </style></head><body></body></html>`;
    expect(lintDsUsage(html, { declaredVars: DS_VARS })).toEqual(lintDsUsage(html, { declaredVars: DS_VARS }));
  });
});
