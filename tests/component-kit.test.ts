/**
 * Component-kit (P2a wave A + P2b wave B + P2c wave C) — the 21 components `ds init` registers
 * into every fresh design system. Verifies the kit's structural contract (validity, shape), markup
 * hygiene (semantic vars only, every var real, tokensUsed correlated), and the a11y
 * wrap-lint. The specimen 0/0 contract + the `ds init` count are E2E'd in cmd-ds-init.
 */
import { describe, expect, it } from "vitest";

import { COMPONENT_KIT } from "../src/core/component-kit/index.js";
import { validateComponentRecord } from "../src/core/registry-store.js";
import { lintA11y } from "../src/core/a11y-lint.js";
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
  it("ships exactly 21 kit components, name-sorted, all stable", () => {
    expect(COMPONENT_KIT).toHaveLength(21);
    const names = COMPONENT_KIT.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual([
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

// ─── A11y wrap-lint (fragment wrapped in a minimal shell → 0 errors) ────────────

describe("component-kit — a11y wrap-lint", () => {
  const wrap = (fragment: string): string =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kit specimen</title></head><body>${fragment}</body></html>`;

  it("each fragment, wrapped in a minimal shell, lints with 0 a11y errors and 0 warnings", () => {
    for (const c of COMPONENT_KIT) {
      const res = lintA11y(wrap(c.markup));
      expect(res.errorCount, `${c.name} errors: ${JSON.stringify(res.findings)}`).toBe(0);
      expect(res.warningCount, `${c.name} warnings: ${JSON.stringify(res.findings)}`).toBe(0);
    }
  });
});
