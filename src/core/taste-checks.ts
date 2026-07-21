/**
 * Individual check functions for the deterministic taste linter.
 *
 * Each function takes the raw HTML string and returns zero or more findings.
 * All checks are pure string/regex heuristics — no DOM parser, no browser.
 *
 * Unlike layout-checks (which check whether a document *renders*), these check
 * whether a document *honors the mechanically-verifiable subset* of the 6+1
 * taste rubric (knowledge/taste-rubric.md). They are the deterministic floor
 * under the model's self-scored critique: a variant that trips an error here
 * breaks a rubric rule the model cannot talk its way past.
 *
 * Only rubric signals that are unambiguously checkable from static HTML are
 * implemented. Subjective axis judgment (is the composition "authored"? is the
 * motion "expressive"?) stays with the model. Each check cites the rubric line
 * it enforces. Precision over recall: when in doubt, do NOT flag — a false
 * positive that fails a good variant is worse than a missed marginal one.
 *
 * This module is the barrel for all per-axis checks. Typography / Spacing /
 * Iconography / Depth live here; the Motion and Consistency axes live in
 * taste-checks-motion.ts / taste-checks-consistency.ts (re-exported below);
 * shared string helpers live in taste-checks-shared.ts.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, lineOf } from "./taste-checks-shared.js";

// Re-export the split-out per-axis modules so consumers (taste-lint.ts, tests)
// keep a single import surface.
export {
  checkLinearOrAllTransition,
  checkAnimationNoReducedMotion,
  checkKeyframesLayoutProps,
} from "./taste-checks-motion.js";
export { checkRawHexWhenTokenExists } from "./taste-checks-consistency.js";

// ─── Typography: body font-size ≥ 16px (rubric line 91) ─────────────────────────

/**
 * tiny-body-text: a font-size below 16px applied via inline style, a `<style>`
 * rule, or a Tailwind arbitrary value `text-[Npx]`. The rubric is explicit:
 * "Body text never below 16px" (Typography axis) — but the rule is about BODY
 * copy. Small UI chrome (badges, captions, labels, nav, buttons, table meta,
 * code, eyebrow headings) legitimately goes below 16px, so a size ≤13px is only
 * a violation when it is NOT explained by a chrome/label/heading role.
 *
 * Role is read from the selector (for `<style>` rules) or the element's tag +
 * class/id (for inline styles / Tailwind). If the context names a chrome role we
 * exempt it down to an ABUSE_FLOOR (9px) below which even chrome is broken. Body
 * contexts (`p`, `body`, `.prose`, `.description`, an unlabelled `<div>`…) still
 * flag at ≤13px. Precision over recall (dogfood L2: a UI-kit showcase of badges
 * and nav should not read as 35 body-text violations).
 */
const BODY_FLOOR = 13; // ≤ this is flagged for body text
const ABUSE_FLOOR = 9; // < this is flagged even for chrome — nothing should be this small

/** Selector / element context that is NOT body copy (chrome, labels, headings, controls, secondary text). */
// Leading boundary is intentionally omitted (trailing `\b` kept) so compound/abbreviated class
// tokens still match a role — e.g. `savatar`→avatar, `icode`→code, `metric-t`→metric. This widens
// exemptions, which is the correct bias for a precision-over-recall taste check.
const CHROME_ROLE_RE =
  /(?:h[1-6]|nav|navbar|brand|badge|chip|pill|tag|label|lbl|method|meta|caption|code|pre|kbd|mono|icon|ico|small|hint|tip|tooltip|toast|tab|tabs|breadcrumb|crumb|footnote|legend|counter?|timestamp|time|date|unit|eyebrow|overline|kicker|subtitle|sublabel|helper|help|micro|fineprint|disclaimer|status|state|dot|pip|avatar|swatch|spec|note|name|btn|button|input|field|placeholder|toolbar|stat|metric|kpi|pager|th|td|thead|tfoot|sec|sub|muted|subtle|secondary|dim|faint|quiet|soft|ghost|pagination|summary|footer|foot|aside|sidebar|rail|menu|dropdown|row|cell|header)\b/i;

/** Element context that IS plausibly body copy — the only inline/Tailwind case worth flagging. */
const BODY_ROLE_RE =
  /\b(?:p|body|article|prose|content|description|desc|copy|paragraph|para|readme|bio|about|message|msg|text-body|bodytext)\b/i;

const FONT_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i;

function tinyMsg(px: number, prefix: string): string {
  return `${prefix} ${px}px is below the 16px body-text floor (rubric: "Body text never below 16px") — too small for body copy${px < ABUSE_FLOOR ? "" : "; if this is a badge/label/nav element, name that role so it can be exempted"}`;
}

/**
 * `<style>`-rule verdict: the selector carries semantics, so flag a ≤BODY_FLOOR size UNLESS a
 * chrome role explains it (below ABUSE_FLOOR nothing is acceptable).
 */
function isSelectorViolation(px: number, selector: string): boolean {
  if (px <= 0) return false;
  if (px < ABUSE_FLOOR) return true;
  if (px > BODY_FLOOR) return false;
  return !CHROME_ROLE_RE.test(selector);
}

/**
 * Inline-style / Tailwind verdict: there is no selector, and an inline font-size is almost always a
 * one-off chrome micro-adjustment (badges, status, meta), not body copy — body copy is styled via
 * classes/stylesheets. So flag ONLY when the element is positively body-named, or the size is broken
 * (<ABUSE_FLOOR). Precision over recall.
 */
function isInlineViolation(px: number, roleContext: string): boolean {
  if (px <= 0) return false;
  if (px < ABUSE_FLOOR) return true;
  if (px > BODY_FLOOR) return false;
  return BODY_ROLE_RE.test(roleContext);
}

export function checkTinyBodyText(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  let m: RegExpExecArray | null;

  // 1. <style> rules — parse `selector { … }` so the selector gives the role.
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let s: RegExpExecArray | null;
  while ((s = styleRe.exec(html)) !== null) {
    const block = s[1] ?? "";
    const base = s.index + s[0].indexOf(block);
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let r: RegExpExecArray | null;
    while ((r = ruleRe.exec(block)) !== null) {
      const selector = r[1] ?? "", body = r[2] ?? "";
      const fs = FONT_SIZE_RE.exec(body);
      if (fs === null) continue;
      const px = parseFloat(fs[1] ?? "0");
      if (isSelectorViolation(px, selector)) {
        // Point the line at the font-size token itself (the selector may span newlines).
        const fsOffset = base + r.index + selector.length + 1 + (fs.index ?? 0);
        findings.push({ checkId: "tiny-body-text", axis: "Typography", severity: "error", message: tinyMsg(px, "font-size"), line: lineOf(html, fsOffset) });
      }
    }
  }

  // 2. Inline style="… font-size:Npx …" — role from the element's tag + class/id.
  const inlineRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\bstyle\s*=\s*"([^"]*)"/gi;
  while ((m = inlineRe.exec(html)) !== null) {
    const fs = FONT_SIZE_RE.exec(m[3] ?? "");
    if (fs === null) continue;
    const px = parseFloat(fs[1] ?? "0");
    const roleContext = `${m[1] ?? ""} ${m[2] ?? ""}`;
    if (isInlineViolation(px, roleContext)) {
      findings.push({ checkId: "tiny-body-text", axis: "Typography", severity: "error", message: tinyMsg(px, "font-size"), line: lineOf(html, m.index) });
    }
  }

  // 3. Tailwind arbitrary font-size: text-[Npx] — role from the element's classlist + tag.
  const twRe = /<([a-zA-Z][\w-]*)\b([^>]*?\btext-\[(\d+(?:\.\d+)?)px\][^>]*)>/gi;
  while ((m = twRe.exec(html)) !== null) {
    const px = parseFloat(m[3] ?? "0");
    const roleContext = `${m[1] ?? ""} ${m[2] ?? ""}`;
    if (isInlineViolation(px, roleContext)) {
      findings.push({ checkId: "tiny-body-text", axis: "Typography", severity: "error", message: tinyMsg(px, "Tailwind text-["), line: lineOf(html, m.index) });
    }
  }

  return findings;
}

// ─── Spacing: values on one base unit (rubric lines 109–114) ────────────────────

/**
 * off-grid-spacing: Tailwind arbitrary spacing utilities with a px value that
 * is not a multiple of 4 (the rubric's base-unit rule: "choose one base unit
 * (commonly 4px or 8px) and make every gap and pad a multiple of it";
 * anti-pattern: "off-grid values (13px, 27px)").
 *
 * Scope is restricted to the spacing-bearing utility prefixes so that, e.g.,
 * border-[1px] (a hairline, not spacing) is never flagged. Only flags values
 * > 4px that are not divisible by 4 — sub-4px values are hairlines/optical
 * nudges, not spacing-rhythm violations. Heuristic by design.
 */
export function checkOffGridSpacing(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  // Spacing utilities: margin (m,mt,mr,mb,ml,mx,my), padding (p,…), gap, space-x/y,
  // and inset (top/right/bottom/left). Matches `<prefix>-[Npx]`.
  const re = /\b(?:-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left))-\[(\d+(?:\.\d+)?)px\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const px = parseFloat(m[1] ?? "0");
    // Only whole-px values > 4 that break the 4px grid. 0–4 are nudges/hairlines.
    if (Number.isInteger(px) && px > 4 && px % 4 !== 0) {
      findings.push({
        checkId: "off-grid-spacing", axis: "Spacing", severity: "error",
        message: `spacing value ${px}px is off the 4px base grid (rubric anti-pattern: "off-grid values (13px, 27px)") — use a multiple of 4`,
        line: lineOf(html, m.index),
      });
    }
  }
  return findings;
}

// ─── Iconography: exactly one icon family (rubric lines 186, 192) ───────────────

/**
 * mixed-icon-families: more than one icon library referenced. The rubric is
 * explicit: "use exactly one icon family for the whole UI"; anti-pattern: "two
 * or more icon sets in one UI". Detects the common CDN/library signatures.
 * Phosphor is the generated-code default. Legacy Lucide documents remain
 * detectable as one family; mixing either with a second family fails.
 */
export function checkMixedIconFamilies(html: string): TasteFinding[] {
  const families: { name: string; re: RegExp }[] = [
    { name: "Phosphor",      re: /@phosphor-icons|phosphor-icons|data-phosphor|class=["'][^"']*\bph-/i },
    { name: "Lucide",        re: /\blucide\b|data-lucide\s*=|lucide\.createIcons/i },
    { name: "Font Awesome",  re: /\bfa-(?:solid|regular|brands|light|duotone)\b|\bfas\b|\bfar\b|\bfab\b|font-?awesome/i },
    { name: "Material Icons", re: /material-icons|material-symbols/i },
    { name: "Bootstrap Icons", re: /\bbi-[a-z]|bootstrap-icons/i },
    { name: "Heroicons",     re: /heroicons/i },
    { name: "Feather",       re: /feather-icons|data-feather\s*=/i },
    { name: "Ionicons",      re: /\bion-icon\b|ionicons/i },
    { name: "Tabler",        re: /tabler-icons|\bti-[a-z]/i },
  ];
  const present = families.filter((f) => f.re.test(html)).map((f) => f.name);
  if (present.length >= 2) {
    return [{
      checkId: "mixed-icon-families", axis: "Iconography", severity: "error",
      message: `${present.length} icon families detected (${present.join(", ")}) — rubric requires "exactly one icon family for the whole UI"`,
    }];
  }
  return [];
}

/**
 * text-arrow-as-interface-icon: Unicode arrows inside interface chrome are text
 * glyphs, not icons. They inherit font metrics, vary by platform, and bypass the
 * declared icon family. Generated UI must use the declared icon component
 * (Phosphor for greenfield v2 work) and mark decorative arrows aria-hidden.
 *
 * Precision boundary: interactive and compact UI tags are scanned. Paragraphs,
 * headings, code samples, and preformatted content are excluded.
 */
export function checkTextArrowAsInterfaceIcon(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const interactive = /<(a|button|span|b|strong|small|i|label)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const arrow = /[←↑→↓↖↗↘↙⇐⇑⇒⇓⟵⟶⟷⟹➜➝➞➟➠]/;
  let match: RegExpExecArray | null;
  while ((match = interactive.exec(html)) !== null) {
    const visibleText = (match[2] ?? "").replace(/<[^>]*>/g, "");
    const glyph = arrow.exec(visibleText)?.[0];
    if (glyph === undefined) continue;
    findings.push({
      checkId: "text-arrow-as-interface-icon",
      axis: "Iconography",
      severity: "error",
      message: `interactive text uses Unicode arrow '${glyph}' instead of the declared icon family — replace it with a Phosphor arrow component (decorative icons aria-hidden)`,
      line: lineOf(html, match.index),
    });
  }
  return findings;
}

// ─── Depth/Surface: shadows tinted, not pure black (rubric lines 228, 231) ──────

/**
 * pure-black-shadow: a box-shadow / drop-shadow using pure opaque-ish black.
 * The rubric: "Shadows should be tinted toward the background hue, not pure
 * black"; anti-pattern: "pure-black harsh shadows". Flags shadow declarations
 * whose color is #000/#000000 or rgb/rgba black at high alpha (≥ 0.5 — a soft
 * low-alpha black is the conventional, acceptable shadow and is NOT flagged).
 */
export function checkPureBlackShadow(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  // Find shadow declarations (box-shadow / filter: drop-shadow / Tailwind shadow-[...]).
  const shadowDecl = /(?:box-shadow|drop-shadow|--tw-shadow)\s*:\s*([^;}"']+)/gi;
  const twShadow = /\bshadow-\[([^\]]+)\]/g;

  const scan = (haystack: string, isTw: boolean) => {
    let m: RegExpExecArray | null;
    const re = isTw ? twShadow : shadowDecl;
    re.lastIndex = 0;
    while ((m = re.exec(haystack)) !== null) {
      const val = (m[1] ?? "").toLowerCase();
      // Pure black hex (#000 or #000000), or rgb black, or rgba black with alpha ≥ 0.5.
      const hexBlack = /#000(?:000)?\b/.test(val);
      const rgbBlack = /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(val);
      let rgbaHardBlack = false;
      const rgbaM = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+|1(?:\.0)?)\s*\)/.exec(val);
      if (rgbaM) {
        const alpha = parseFloat(rgbaM[1] ?? "0");
        rgbaHardBlack = alpha >= 0.5;
      }
      if (hexBlack || rgbBlack || rgbaHardBlack) {
        findings.push({
          checkId: "pure-black-shadow", axis: "Depth/Surface", severity: "error",
          message: `shadow uses pure/hard black (rubric: "Shadows should be tinted toward the background hue, not pure black") — tint the shadow or lower its alpha below 0.5`,
        });
      }
    }
  };
  scan(css, false);
  scan(html, true); // Tailwind shadow-[...] lives in class attributes, not CSS regions
  return findings;
}
