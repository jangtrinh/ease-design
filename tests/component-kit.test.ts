/**
 * Component-kit (P2a wave A + P2b wave B + P2c wave C + wave D + spec 010 P1) — the 27
 * components `ds init` registers into every fresh design system. Verifies the kit's
 * structural contract (validity, shape), markup hygiene (semantic vars only, every var
 * real, tokensUsed correlated), the FULL linter set wrap-lint (a11y/layout/taste/content —
 * the repo's hard-won rule: a generated artifact runs the full set in its own tests, not a
 * subset), and the new responsive-story floor (spec 010 P1). The specimen 0/0 contract +
 * the `ds init` count are E2E'd in cmd-ds-init.
 */
import { describe, expect, it } from "vitest";

import { COMPONENT_KIT } from "../src/core/component-kit/index.js";
import { table } from "../src/core/component-kit/table.js";
import { lintResponsive } from "../src/core/component-kit/responsive-lint.js";
import { validateComponentRecord } from "../src/core/registry-store.js";
import { lintA11y } from "../src/core/a11y-lint.js";
import { lintLayout } from "../src/core/layout-lint.js";
import { lintTaste } from "../src/core/taste-lint.js";
import { allContentChecks } from "../src/core/content-checks.js";
import { loadPersonaIndex, findPersona } from "../src/core/persona-loader.js";
import { expandPersona } from "../src/core/persona-expand.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { emitCss } from "../src/core/token-emit.js";

const PERSONAS_PATH = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

/** The set of `--custom-property` names a persona's compiled CSS defines. */
function compiledVars(slug: string): Set<string> {
  const persona = findPersona(loadPersonaIndex(PERSONAS_PATH), slug);
  const css = emitCss(resolveTokens(expandPersona({ persona, intent: "kit" }).tokens));
  const set = new Set<string>();
  for (const m of css.matchAll(/^\s*(--[\w-]+):/gm)) set.add(m[1] as string);
  return set;
}
// Cross-check against a light ("both") persona and a dark-only persona.
const VARS_LIGHT = compiledVars("liquid-glass");
const VARS_DARK = compiledVars("velvet-noir");

/** Dotted token path → CSS custom-property name (mirrors token-emit's pathToCssVar). */
const pathToVar = (path: string): string => "--" + path.replace(/\./g, "-");
/** Every `var(--x)` referenced in a markup string. */
function varsUsed(markup: string): Set<string> {
  const set = new Set<string>();
  for (const m of markup.matchAll(/var\((--[\w-]+)/g)) set.add(m[1] as string);
  return set;
}

// ─── Structural contract ───────────────────────────────────────────────────────

describe("component-kit — records", () => {
  it("ships exactly 27 kit components, name-sorted, all stable", () => {
    expect(COMPONENT_KIT).toHaveLength(27);
    const names = COMPONENT_KIT.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual([
      "Control/Button", "Control/Checkbox", "Control/Combobox", "Control/Input",
      "Control/Radio", "Control/Select", "Control/Switch", "Control/Textarea",
      "Data/Table",
      "Display/Alert", "Display/Avatar", "Display/Badge", "Display/Card",
      "Display/Kbd", "Display/Progress", "Display/Separator", "Display/Skeleton",
      "Display/Toast",
      "Form/Field",
      "Overlay/Dialog", "Overlay/DropdownMenu", "Overlay/Popover", "Overlay/Tooltip",
      "Structure/Accordion", "Structure/Breadcrumb", "Structure/Pagination", "Structure/Tabs",
    ]);
    for (const c of COMPONENT_KIT) expect(c.status, c.name).toBe("stable");
  });

  it("every record passes validateComponentRecord unchanged", () => {
    for (const c of COMPONENT_KIT) {
      expect(() => validateComponentRecord(c), c.name).not.toThrow();
      // Round-trips: the validator returns an equivalent record (only schema keys).
      expect(validateComponentRecord(c), c.name).toEqual(c);
    }
  });

  it("each declares a State axis via variants (the specimen source of truth)", () => {
    for (const c of COMPONENT_KIT) {
      expect(c.variants?.some((v) => v.startsWith("State=")), c.name).toBe(true);
    }
  });
});

// ─── Markup hygiene (semantic vars only, every var real, tokensUsed correlated) ─

describe("component-kit — markup hygiene", () => {
  it("no markup contains a hex or rgb/hsl colour literal", () => {
    for (const c of COMPONENT_KIT) {
      expect(c.markup.match(/#[0-9a-fA-F]{3,8}\b/g), `${c.name} hex`).toBeNull();
      expect(c.markup.match(/\b(rgba?|hsla?)\s*\(/gi), `${c.name} rgb/hsl`).toBeNull();
    }
  });

  it("every var(--x) used resolves in the compiled CSS of two different personas", () => {
    for (const c of COMPONENT_KIT) {
      for (const v of varsUsed(c.markup)) {
        expect(VARS_LIGHT.has(v), `${c.name}: ${v} missing in liquid-glass`).toBe(true);
        expect(VARS_DARK.has(v), `${c.name}: ${v} missing in velvet-noir`).toBe(true);
      }
    }
  });

  it("every colour is a semantic --color-* var (no primitive/hardcoded colour vars)", () => {
    // The only var prefixes a mature-kit fragment may use (all semantic-layer tiers).
    // `elevation` is the semantic shadow role wave-B surfaces (Card, Dialog) compose from.
    const ALLOWED = /^--(color|radius|font-family|font-size|font-weight|space|duration|motion|elevation)-/;
    for (const c of COMPONENT_KIT) {
      for (const v of varsUsed(c.markup)) {
        expect(ALLOWED.test(v), `${c.name}: ${v} is not an allowed semantic var prefix`).toBe(true);
      }
    }
  });

  it("every tokensUsed path resolves to a compiled var, and covers every colour used", () => {
    for (const c of COMPONENT_KIT) {
      // (a) each declared token is a real compiled var
      for (const t of c.tokensUsed) {
        expect(VARS_LIGHT.has(pathToVar(t)), `${c.name}: tokensUsed ${t} not compiled`).toBe(true);
      }
      // (b) every colour var actually used is declared in tokensUsed (main colour paths)
      const declared = new Set(c.tokensUsed);
      for (const v of varsUsed(c.markup)) {
        if (v.startsWith("--color-")) {
          const path = "color." + v.slice("--color-".length);
          expect(declared.has(path), `${c.name}: uses ${v} but ${path} not in tokensUsed`).toBe(true);
        }
      }
    }
  });
});

// ─── FULL linter set wrap-lint (fragment wrapped in a VALID document → 0 errors) ─
//
// Hard-won rule (dogfood): "the kit runs the FULL linter set in its own tests." A
// generated specimen once shipped an unguarded animation because its gate ran 3 of 4
// linters. A first measurement of "27/27 fail a11y" once turned out to be a missing
// `lang` in the harness, not a kit defect — so the wrap below is a full, valid document
// (`<html lang="en">`, `<meta charset>`, `<title>`), never a bare fragment.

describe("component-kit — full linter set wrap-lint (a11y + layout + taste + content)", () => {
  // Table now genuinely reflows (spec 010 P1), so the wrap must be a document a
  // responsive component could actually ship in — including the viewport meta a11y-lint's
  // `checkViewportMetaPresent` requires of any doc carrying `@media`. Omitting it here
  // would be exactly the harness bug the docstring above warns against (missing `lang`
  // once made "27/27 fail a11y" look like a kit defect); a missing viewport meta on a
  // media-query'd doc is the same class of harness gap, not a Table defect.
  const wrap = (fragment: string): string =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kit specimen</title></head><body>${fragment}</body></html>`;

  it("each fragment, wrapped in a valid document, lints with 0 a11y errors and 0 warnings", () => {
    for (const c of COMPONENT_KIT) {
      const res = lintA11y(wrap(c.markup));
      expect(res.errorCount, `${c.name} errors: ${JSON.stringify(res.findings)}`).toBe(0);
      expect(res.warningCount, `${c.name} warnings: ${JSON.stringify(res.findings)}`).toBe(0);
    }
  });

  it("each fragment, wrapped in a valid document, lints with 0 layout errors", () => {
    for (const c of COMPONENT_KIT) {
      const res = lintLayout(wrap(c.markup));
      expect(res.errorCount, `${c.name} errors: ${JSON.stringify(res.findings)}`).toBe(0);
    }
  });

  it("each fragment, wrapped in a valid document, lints with 0 taste errors", () => {
    for (const c of COMPONENT_KIT) {
      const res = lintTaste(wrap(c.markup));
      expect(res.errorCount, `${c.name} errors: ${JSON.stringify(res.findings)}`).toBe(0);
    }
  });

  it("each fragment, wrapped in a valid document, lints with 0 content errors", () => {
    for (const c of COMPONENT_KIT) {
      const html = wrap(c.markup);
      const findings = allContentChecks.flatMap((check) => check(html));
      const errorCount = findings.filter((f) => f.severity === "error").length;
      expect(errorCount, `${c.name} errors: ${JSON.stringify(findings)}`).toBe(0);
    }
  });
});

// ─── Responsive-story floor (spec 010 P1) ───────────────────────────────────────
//
// Phase 1 is a tracer bullet: the scale + ONE component (Table) reflowing + this
// linter + these tests, end to end. The linter fails 26 of 27 components ON PURPOSE
// (plan.md: "That is Art II working" — the check's first run tells the truth about a
// kit that has never rendered a phone). Phase 2 shrinks this list to zero by changing
// the kit, never by softening the check — so the list below is pinned explicitly: a
// shrinking pass count here (still not 0) means Phase 2 is landing; a change to this
// LIST (not just the count) means a component's name changed or the check regressed.

/** Every kit component except Table, sorted — the known, listed 26 spec 010 P1 leaves
 * failing on purpose. Phase 2's job is to shrink this array to `[]`. */
const RESPONSIVE_EXEMPT_NONE: string[] = [
  "Control/Button", "Control/Checkbox", "Control/Combobox", "Control/Input",
  "Control/Radio", "Control/Select", "Control/Switch", "Control/Textarea",
  "Display/Alert", "Display/Avatar", "Display/Badge", "Display/Card",
  "Display/Kbd", "Display/Progress", "Display/Separator", "Display/Skeleton",
  "Display/Toast",
  "Form/Field",
  "Overlay/Dialog", "Overlay/DropdownMenu", "Overlay/Popover", "Overlay/Tooltip",
  "Structure/Accordion", "Structure/Breadcrumb", "Structure/Pagination", "Structure/Tabs",
];

describe("component-kit — responsive-story floor (spec 010 P1)", () => {
  it("Data/Table reflows (has @media (min-width: …)) and passes with 0 findings", () => {
    const res = lintResponsive([{ name: table.name, markup: table.markup }]);
    expect(res.errorCount, JSON.stringify(res.findings)).toBe(0);
  });

  it("fails exactly the known 26 non-reflowing components — no more, no fewer", () => {
    const res = lintResponsive(COMPONENT_KIT.map((c) => ({ name: c.name, markup: c.markup })));
    const failingNames = res.findings.map((f) => f.component).sort((a, b) => a.localeCompare(b));
    expect(failingNames).toEqual(RESPONSIVE_EXEMPT_NONE);
    expect(res.errorCount).toBe(26);
    // Every failure here is checkId "responsive-missing" (absence), never
    // "responsive-exempt-no-reason" (a malformed exemption) — none of the 26 have
    // attempted an exemption yet.
    for (const f of res.findings) expect(f.checkId, f.component).toBe("responsive-missing");
  });

  it("a component with an unreasoned exemption fails distinctly from a silent one", () => {
    const noReason = lintResponsive([{ name: "Test/NoReason", markup: "<div><!-- responsive-exempt --></div>" }]);
    expect(noReason.errorCount).toBe(1);
    expect(noReason.findings[0]?.checkId).toBe("responsive-exempt-no-reason");

    const reasoned = lintResponsive([{
      name: "Test/Reasoned",
      markup: "<div><!-- responsive-exempt: icon-only control, nothing to reflow --></div>",
    }]);
    expect(reasoned.errorCount).toBe(0);
  });
});

// ─── Token-only boundary (spec 010 P1 risk: the breakpoint literal must not open ─
// ─── the door to other literals — plan.md's named risk, pinned as a real test)  ──

describe("component-kit — token-only boundary holds on Table", () => {
  // The ONLY new raw numbers this phase permits in a kit component:
  //  - the breakpoint CONDITION itself (`min-width: 40rem`) — owner decision: a layout
  //    constant, not a design token (`@media (min-width: var(--x))` is invalid CSS).
  //  - the WCAG visually-hidden ("sr-only") clip technique's `1px` / `-1px` pair — a11y
  //    boilerplate, not a design/space decision.
  //  - unitless `0` / `auto` — the neutral reset, not a design/space decision.
  // Colour/space/typography stay token-only; this test pins that boundary so the
  // breakpoint exception cannot silently widen (plan.md risk table).
  const SPACE_AND_TYPE_DECLARATION =
    /(padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|font-size|line-height|border-radius)\s*:\s*([^;]+);/gi;
  const ALLOWED_RAW_TERMS = new Set(["-1px", "1px", "0"]);

  it("Table's @media condition is the counted breakpoint literal, and nothing else", () => {
    const conditions = [...table.markup.matchAll(/@media\s*\(\s*min-width\s*:\s*([^)]+)\)/gi)].map((m) => m[1]?.trim());
    expect(conditions).toEqual(["40rem"]);
  });

  it("every padding/margin/gap/font-size/line-height/border-radius value is var(--…) or the allow-list", () => {
    for (const m of table.markup.matchAll(SPACE_AND_TYPE_DECLARATION)) {
      const [, prop, rawValue] = m;
      for (const term of (rawValue ?? "").trim().split(/\s+/)) {
        const isVar = /^var\(--[\w-]+\)$/.test(term);
        const isAllowed = ALLOWED_RAW_TERMS.has(term);
        expect(isVar || isAllowed, `Table ${prop}: raw literal '${term}' is neither var(--…) nor on the allow-list`).toBe(true);
      }
    }
  });
});
