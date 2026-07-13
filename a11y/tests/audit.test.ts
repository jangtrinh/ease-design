// Rendered-audit tests: launch REAL system Chrome and run axe-core over fixture pages.
// Gated behind hasChrome() so a runner without Chrome skips instead of hard-failing. On this
// machine (and GitHub ubuntu-latest, which ships Chrome) the probe passes and these run —
// the "one run on real data before it's done" the dogfood rules demand.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import { runAudit } from "../cli/src/audit.ts";
import { hasChrome } from "./has-chrome.ts";

const fixture = (name: string): string => resolve(import.meta.dirname, "fixtures", name);
const ids = (violations: { id: string }[]): Set<string> => new Set(violations.map((v) => v.id));

describe.skipIf(!hasChrome())("runAudit (real Chrome + axe-core)", () => {
  it("detects the rendered violations on the dirty fixture and gates (violations > 0)", async () => {
    const data = await runAudit([fixture("violations.html")]);
    expect(data.pages).toHaveLength(1);
    const page = data.pages[0]!;
    const found = ids(page.violations);
    // image-alt is a static defect; color-contrast is RENDERED-ONLY — the reason tier-2 exists.
    expect(found.has("image-alt")).toBe(true);
    expect(found.has("color-contrast")).toBe(true);
    expect(page.violationCount).toBe(page.violations.length);
    expect(data.totals.violations).toBeGreaterThan(0); // → the CLI exits 1
  });

  it("emits the full envelope-ready shape with a real axe version", async () => {
    const data = await runAudit([fixture("violations.html")]);
    const page = data.pages[0]!;
    expect(Object.keys(page).sort()).toEqual(
      ["incompleteCount", "passCount", "target", "violationCount", "violations"].sort(),
    );
    const v = page.violations.find((x) => x.id === "color-contrast")!;
    expect(v).toMatchObject({ id: "color-contrast", help: expect.any(String), helpUrl: expect.any(String) });
    expect(typeof v.nodes).toBe("number");
    expect(typeof v.sample).toBe("string");
    expect(page.passCount).toBeGreaterThan(0);
    expect(data.totals.pages).toBe(1);
    expect(data.axeVersion).toMatch(/^\d+\.\d+/); // e.g. "4.10.0"
  });

  it("reports zero violations on the clean fixture (exit 0), still not a conformance claim", async () => {
    const data = await runAudit([fixture("clean.html")]);
    expect(data.totals.violations).toBe(0);
    expect(data.pages[0]!.violations).toEqual([]);
  });

  it("narrows the rules run when --tags excludes AA: color-contrast (wcag2aa) drops under wcag2a-only", async () => {
    const full = await runAudit([fixture("violations.html")], { tags: ["wcag2a", "wcag2aa"] });
    const aOnly = await runAudit([fixture("violations.html")], { tags: ["wcag2a"] });
    expect(ids(full.pages[0]!.violations).has("color-contrast")).toBe(true);
    // color-contrast is a wcag2aa rule → filtering to wcag2a alone must not run it.
    expect(ids(aOnly.pages[0]!.violations).has("color-contrast")).toBe(false);
    // …but image-alt (wcag2a) still fires, proving the page still ran, just fewer rules.
    expect(ids(aOnly.pages[0]!.violations).has("image-alt")).toBe(true);
  });
});
