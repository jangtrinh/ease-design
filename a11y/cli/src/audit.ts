/**
 * `runAudit` — the tier-2 rendered pass. Open each target in system Chrome, run axe-core
 * over the LIVE DOM (computed styles, resolved contrast, ARIA usage), and flatten the
 * result to the plain {@link AuditData} the envelope layer emits.
 *
 * This is the ONLY browser-coupled module. It maps axe's `AxeResults` down to `PageReport`;
 * the envelope/format layer (and its tests) then work on that plain shape without a browser.
 */
import AxeBuilder from "@axe-core/playwright";
import type { AxeResults, Result } from "axe-core";

import { launchChrome } from "./browser.ts";
import { toUrl } from "./targets.ts";
import type { AuditData, PageReport, Violation } from "./types.ts";

/** Default rule set: WCAG 2.0 A + AA (the widely-expected floor). */
export const DEFAULT_TAGS = ["wcag2a", "wcag2aa"] as const;

function toViolation(r: Result): Violation {
  const firstNode = r.nodes[0];
  const sample = firstNode ? String(firstNode.target?.[0] ?? "") : "";
  return {
    id: r.id,
    impact: r.impact ?? null,
    help: r.help,
    helpUrl: r.helpUrl,
    nodes: r.nodes.length,
    sample,
  };
}

function toPageReport(target: string, results: AxeResults): PageReport {
  const violations = results.violations.map(toViolation);
  return {
    target,
    violations,
    violationCount: violations.length,
    passCount: results.passes.length,
    incompleteCount: results.incomplete.length,
  };
}

export interface AuditOptions {
  /** axe tag filter (rule selector). Defaults to {@link DEFAULT_TAGS}. */
  tags?: readonly string[];
}

/**
 * Audit every target and return the merged payload. Launches ONE browser for the whole batch
 * and closes it in `finally` (even on error). Exit gating is the caller's job: 1 iff any
 * violation. `axeVersion` is taken from the engine that actually ran.
 */
export async function runAudit(targets: readonly string[], opts: AuditOptions = {}): Promise<AuditData> {
  const tags = [...(opts.tags ?? DEFAULT_TAGS)];
  const browser = await launchChrome();
  // axe-core/playwright requires a page from an EXPLICIT context (not browser.newPage()) so it
  // can drive frame traversal — see the @axe-core/playwright error-handling note.
  const context = await browser.newContext();
  const pages: PageReport[] = [];
  let axeVersion = "";
  try {
    for (const target of targets) {
      const page = await context.newPage();
      try {
        await page.goto(toUrl(target), { waitUntil: "load" });
        const results = await new AxeBuilder({ page }).withTags(tags).analyze();
        axeVersion ||= results.testEngine?.version ?? "";
        pages.push(toPageReport(target, results));
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  const violations = pages.reduce((n, p) => n + p.violationCount, 0);
  return { pages, totals: { violations, pages: pages.length }, axeVersion };
}
