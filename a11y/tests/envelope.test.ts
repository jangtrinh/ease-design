// Pure-logic tests for the envelope + human renderer + the honesty WORDING discipline.
// No browser: these build synthetic AuditData and assert shape/text, so they always run.
import { describe, it, expect } from "vitest";

import { okEnv, errEnv, formatText, COMMAND, MANUAL_RESIDUE } from "../cli/src/envelope.ts";
import { toUrl } from "../cli/src/targets.ts";
import type { AuditData } from "../cli/src/types.ts";

const CLEAN: AuditData = {
  pages: [{ target: "clean.html", violations: [], violationCount: 0, passCount: 21, incompleteCount: 3 }],
  totals: { violations: 0, pages: 1 },
  axeVersion: "4.10.0",
};

const DIRTY: AuditData = {
  pages: [
    {
      target: "page.html",
      violations: [
        { id: "image-alt", impact: "critical", help: "Images must have alternate text", helpUrl: "https://x/image-alt", nodes: 1, sample: "img" },
        { id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds", helpUrl: "https://x/color-contrast", nodes: 2, sample: "p" },
      ],
      violationCount: 2,
      passCount: 10,
      incompleteCount: 1,
    },
  ],
  totals: { violations: 2, pages: 1 },
  axeVersion: "4.10.0",
};

describe("okEnv / errEnv", () => {
  it("wraps data in the ui-kernel success envelope shape", () => {
    const env = okEnv(CLEAN);
    expect(env).toEqual({ ok: true, command: "a11y-audit", data: CLEAN });
    expect(COMMAND).toBe("a11y-audit");
  });

  it("wraps an error in the ui-kernel failure envelope shape", () => {
    const env = errEnv("NO_BROWSER", "Could not launch Google Chrome");
    expect(env.ok).toBe(false);
    expect(env.command).toBe("a11y-audit");
    expect(env.error).toEqual({ code: "NO_BROWSER", message: "Could not launch Google Chrome" });
  });
});

describe("formatText — honesty wording", () => {
  it("a clean run reports 0 violations found and that manual criteria remain — never 'compliant'/'accessible'", () => {
    const out = formatText(CLEAN);
    expect(out).toContain("0 violations found by axe-core 4.10.0 on the rules run; manual criteria remain");
    // The hard wording rule: the run output must NOT claim compliance or accessibility.
    expect(out.toLowerCase()).not.toContain("compliant");
    expect(out.toLowerCase()).not.toContain("accessible");
  });

  it("names the manual-judgment residue in the summary and stays a non-claim", () => {
    const out = formatText(CLEAN);
    expect(out).toContain("NOT a conformance claim");
    expect(out).toContain(MANUAL_RESIDUE);
  });

  it("renders each violation as the ui-linter line `! [id] target: help (N nodes)`", () => {
    const out = formatText(DIRTY);
    expect(out).toContain("! [image-alt] img: Images must have alternate text (1 nodes)");
    expect(out).toContain("! [color-contrast] p: Elements must meet minimum color contrast ratio thresholds (2 nodes)");
    expect(out).toContain("2 violation(s) across 1 page(s)");
    expect(out.toLowerCase()).not.toContain("compliant");
    expect(out.toLowerCase()).not.toContain("accessible");
  });
});

describe("toUrl", () => {
  it("passes an already-schemed URL through untouched", () => {
    expect(toUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(toUrl("file:///tmp/x.html")).toBe("file:///tmp/x.html");
  });

  it("turns a bare path into an absolute file:// URL", () => {
    const url = toUrl("some/page.html");
    expect(url.startsWith("file://")).toBe(true);
    expect(url.endsWith("/some/page.html")).toBe(true);
  });
});
