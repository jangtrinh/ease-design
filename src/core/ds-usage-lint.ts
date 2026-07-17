/**
 * ds-usage-lint.ts — the ENFORCEMENT linter (spec 009): does a generated page
 * actually use the project's design-system tokens, or does it hardcode colour
 * / reference ghost tokens?
 *
 * `ds context`'s ENFORCEMENT clause tells every host model to style exclusively
 * with the semantic tokens it emits — never hardcode colour when a token
 * covers it. Nothing checked that until this: a page using
 * `var(--totally-undeclared-token)` plus hardcoded hex passed all four
 * existing floors (taste-lint, validate-layout, content-lint, a11y-lint) with
 * zero errors. v1 is COLOUR-ONLY — hardcoded spacing/radius is a deliberate
 * deferral (literals like `1px` borders / `50%` radii are legitimate and
 * lower-signal; a stricter model can revisit in v2).
 *
 * HONESTY (Art VIII): this proves *token usage in the page's own CSS* only.
 * It cannot prove computed/rendered colour, gradients, or inline-SVG fills it
 * never parsed. Never say "on-system" — report exactly what was counted: N
 * hardcoded colours, M off-system tokens, K undeclared references. Not a CSS
 * parser — a brace/regex scan, same class as taste-lint and css-selector-blocks.
 *
 * Algorithm:
 *   1. Locate every `{ … }` block in <style> content (css-selector-blocks.ts)
 *      and classify each selector (css-selector-mode.ts's shared base/mode
 *      table): `:root` / `@theme` / `[data-theme=…]` / `.dark` are
 *      token-DECLARATION blocks — they legitimately hold colour/dimension
 *      LITERALS (they ARE the token definitions). Their custom-property NAMES
 *      still count as "declared on the page" (for the off-system check); their
 *      bodies are excluded from both checks below.
 *   2. In the remaining (component) CSS:
 *      - undeclared-token (error):   var(--x) declared nowhere — not a DS
 *        token, not on the page itself. A broken/ghost reference.
 *      - off-system-token (warning): var(--x) the PAGE declares itself but the
 *        DS does not — the model invented a token; visible, not build-breaking
 *        (an incomplete DS legitimately forces invention — the linter's job is
 *        to surface it, not fail the build).
 *      - hardcoded-color (error): a hex / rgb() / rgba() / hsl() / hsla()
 *        literal in a colour-bearing property (color, background(-color),
 *        border(-color), outline-color, fill, stroke, box-shadow, text-shadow).
 */
import { computeSelectorBlocks } from "./css-selector-blocks.js";
import { classifySelector } from "./css-selector-mode.js";

export type DsUsageSeverity = "error" | "warning";
export type DsUsageCheckId = "undeclared-token" | "off-system-token" | "hardcoded-color";

export interface DsUsageFinding {
  checkId: DsUsageCheckId;
  severity: DsUsageSeverity;
  message: string;
  /** 1-based line number; always locatable — every finding comes from a regex match. */
  line: number;
}

export interface DsUsageLintResult {
  findings: DsUsageFinding[];
  errorCount: number;
  warningCount: number;
  hardcodedColorCount: number;
  offSystemTokenCount: number;
  undeclaredTokenCount: number;
}

export interface DsUsageLintOptions {
  /** Every CSS custom-property name (with leading "--") the DS declares. */
  declaredVars: ReadonlySet<string>;
}

// Longest-alternative-first so "background-color"/"border-color" win over their
// shorter prefix siblings at the same start position.
const COLOR_PROPS_RE =
  /\b(box-shadow|text-shadow|background-color|outline-color|border-color|background|border|color|fill|stroke)\s*:\s*([^;{}]+)[;}]/gi;
const VAR_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[^)]*)?\)/g;
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/;
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\s*\([^)]*\)/i;
const CUSTOM_PROP_DECL_RE = /(--[a-zA-Z0-9_-]+)\s*:/g;

/** Blank a matched span to same-length spaces so byte offsets survive (mirrors taste-lint). */
function blank(s: string, re: RegExp): string {
  return s.replace(re, (m) => " ".repeat(m.length));
}

function lineOf(html: string, idx: number): number {
  return html.slice(0, idx).split("\n").length;
}

/** :root / @theme / [data-theme=…] / .dark — the shared base/mode table (css-selector-mode.ts)
 * doubles as "is this a token-declaration block", since those are exactly the selectors a
 * compiled DS (or its own semantic-alias layer) declares custom properties under. */
function isDeclarationSelector(selector: string): boolean {
  return classifySelector(selector).kind !== "unmapped";
}

export function lintDsUsage(html: string, opts: DsUsageLintOptions): DsUsageLintResult {
  // Blank both comment kinds (CSS /* */ and HTML <!-- -->) so a commented-out
  // reference or hex never trips a check. Same-length spans; offsets hold.
  const scan = blank(blank(html, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);

  const blocks = computeSelectorBlocks(scan, true);
  const declRanges = blocks.filter((b) => isDeclarationSelector(b.selector));
  const inDeclRange = (idx: number): boolean => declRanges.some((b) => b.start <= idx && idx < b.end);

  // Every custom-property NAME the page itself declares in a decl block —
  // literal or alias value both count; only the name matters for off-system.
  const pageDeclaredVars = new Set<string>();
  for (const b of declRanges) {
    const body = scan.slice(b.start, b.end);
    for (const m of body.matchAll(CUSTOM_PROP_DECL_RE)) pageDeclaredVars.add(m[1] as string);
  }

  const findings: DsUsageFinding[] = [];

  // ── var(--x) usage, component CSS only (decl-block usage is the alias layer itself) ──
  for (const m of scan.matchAll(VAR_RE)) {
    const idx = m.index ?? 0;
    if (inDeclRange(idx)) continue;
    const name = m[1] as string;
    if (opts.declaredVars.has(name)) continue; // real DS token — fine
    const line = lineOf(html, idx);
    if (pageDeclaredVars.has(name)) {
      findings.push({
        checkId: "off-system-token",
        severity: "warning",
        message: `${name} is not in the project design system — add via 'ui ds change-token' or it dies with the page.`,
        line,
      });
    } else {
      findings.push({
        checkId: "undeclared-token",
        severity: "error",
        message: `var(${name}) is declared nowhere — not a DS token, not in the page's own :root/@theme/[data-theme]/.dark. Broken reference.`,
        line,
      });
    }
  }

  // ── hardcoded colour literal in a colour-bearing property, component CSS only ──
  for (const m of scan.matchAll(COLOR_PROPS_RE)) {
    const idx = m.index ?? 0;
    if (inDeclRange(idx)) continue;
    const prop = (m[1] as string).toLowerCase();
    const value = (m[2] as string).trim();
    const hexHit = HEX_RE.exec(value)?.[0];
    const fnHit = COLOR_FN_RE.exec(value)?.[0];
    const literal = hexHit ?? fnHit;
    if (literal === undefined) continue;
    findings.push({
      checkId: "hardcoded-color",
      severity: "error",
      message: `hardcoded colour '${literal}' in '${prop}' — the DS covers colour; style with a token instead.`,
      line: lineOf(html, idx),
    });
  }

  findings.sort((a, b) => a.line - b.line);

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  return {
    findings,
    errorCount,
    warningCount,
    hardcodedColorCount: findings.filter((f) => f.checkId === "hardcoded-color").length,
    offSystemTokenCount: findings.filter((f) => f.checkId === "off-system-token").length,
    undeclaredTokenCount: findings.filter((f) => f.checkId === "undeclared-token").length,
  };
}
