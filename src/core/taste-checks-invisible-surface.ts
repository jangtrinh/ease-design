/**
 * mode-invisible-surface (Depth/Surface axis, ERROR) — a boundary that passes
 * text-contrast checks but is invisible in craft terms: a low-alpha WHITE border
 * or fill on a light-mode document (white-on-white), or the dark inverse — a
 * low-alpha BLACK border/fill on a dark-mode document (black-on-black).
 *
 * This is the classic copy-a-dark-recipe-onto-light bug: `border-white/10` is the
 * correct hairline on a dark surface, but pasted onto a white page it separates
 * nothing. A11y linters miss it (no text, no contrast pair); only craft catches it.
 *
 * Mode is read from the document root: the `dark` toggle class or a dark background
 * utility / color on `<html>`/`<body>`/`:root` means dark mode; otherwise the
 * browser default (light) governs. Precision over recall: on a MIXED-mode page (the
 * common light-body-plus-dark-hero shape) a single global mode cannot prove which
 * surface a tint sits on, so the check bails entirely rather than risk flagging a
 * correct white hairline on a dark section. Text tints (`text-white/10`) are never
 * flagged — only surfaces (background / border / ring / divide).
 *
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, lineOf } from "./taste-checks-shared.js";

const CHECK_ID = "mode-invisible-surface";
const ALPHA_FLOOR = 0.15; // below this a same-colour tint reads as no boundary at all

type Mode = "light" | "dark";

/**
 * An UNPREFIXED (no `hover:`/`selection:`/`dark:`/`md:` variant) Tailwind bg
 * utility naming a near-black surface. The `(?<!:)` guard is what keeps a
 * `selection:bg-black/10` or `dark:bg-slate-900` from reading as the page's own
 * background. `bg-[#rrggbb]` arbitrary values are handled separately (luminance).
 */
const DARK_BG_UTIL = /(?<![:\w-])bg-(?:black|(?:slate|gray|grey|zinc|neutral|stone)-(?:800|900|950))\b/i;
/** The dark-mode toggle class as a WHOLE class token (`class="… dark …"`) — not `dark:`, not `*-dark`. */
const DARK_CLASS = /\bclass\s*=\s*["'][^"']*(?<![\w-])dark(?![\w-:])[^"']*["']/i;
/** An UNPREFIXED near-white Tailwind bg utility (light-surface signal). */
const LIGHT_BG_UTIL = /(?<![:\w-])bg-(?:white|(?:slate|gray|grey|zinc|neutral|stone)-(?:50|100))\b/i;

/** sRGB relative luminance (0–1) of a 3/6-digit hex; null if unparseable. */
function hexLuminance(hex: string): number | null {
  const d = hex.replace(/^#/, "");
  const full = d.length === 3 ? d.split("").map((c) => c + c).join("") : d;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/**
 * Decide the document colour mode from its ROOT only (`<html>`/`<body>` tag + the
 * `html|body|:root` CSS rules). Dark when the root carries the `dark` toggle class
 * or a near-black background; light otherwise (the browser default). Only the root
 * is inspected so a dark card on a light page never flips the whole document.
 * Custom-property declarations (`--color-base-dark: …`) are never read as the
 * background — only real `background`/`background-color` properties are.
 */
function rootText(html: string): string {
  const roots: string[] = [];
  const tagRe = /<(?:html|body)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) roots.push(m[0] ?? "");
  const css = cssRegions(html);
  const rootRule = /(?:^|[\s,{])(?:html|body|:root)\b[^{]*\{([^}]*)\}/gi;
  while ((m = rootRule.exec(css)) !== null) roots.push(m[1] ?? "");
  return roots.join(" ");
}

/** Luminance of a real `background`/`background-color` hex in the given text; null when none/opaque-unknown. */
function bgLuminance(text: string): number | null {
  const bgHex = /(?:^|[;{"'\s])background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})\b/i.exec(text);
  return bgHex ? hexLuminance(bgHex[1] ?? "") : null;
}

function detectMode(html: string): Mode {
  const root = rootText(html);
  if (DARK_CLASS.test(root) || DARK_BG_UTIL.test(root)) return "dark";
  const lum = bgLuminance(root);
  if (lum !== null && lum < 0.25) return "dark";
  return "light";
}

/** True when the document uses a near-black surface anywhere (dark section / card / hero). */
function hasDarkSurface(html: string): boolean {
  if (DARK_BG_UTIL.test(html) || DARK_CLASS.test(html)) return true;
  const arb = /(?<![:\w-])bg-\[(#[0-9a-fA-F]{3,6})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = arb.exec(html)) !== null) {
    const lum = hexLuminance(m[1] ?? "");
    if (lum !== null && lum < 0.25) return true;
  }
  const cssLum = bgLuminance(cssRegions(html));
  return cssLum !== null && cssLum < 0.25;
}

/** True when the document uses a near-white surface as an explicit section fill (light signal). */
function hasLightSurface(html: string): boolean {
  if (LIGHT_BG_UTIL.test(html)) return true;
  const arb = /(?<![:\w-])bg-\[(#[0-9a-fA-F]{3,6})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = arb.exec(html)) !== null) {
    const lum = hexLuminance(m[1] ?? "");
    if (lum !== null && lum > 0.85) return true;
  }
  return false;
}

/** Alpha (0–1) of a CSS colour token — rgba()/hsla()/#rrggbbaa — or null when opaque/unknown. */
function cssAlpha(token: string): number | null {
  const fn = /(?:rgba?|hsla?)\(([^)]*)\)/i.exec(token);
  if (fn) {
    const parts = (fn[1] ?? "").split(/[,/]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 4) { const a = parseFloat(parts[3] ?? ""); return Number.isFinite(a) ? a : null; }
    return null; // no alpha channel → opaque
  }
  const hex8 = /^#([0-9a-fA-F]{8})$/.exec(token);
  if (hex8) return parseInt((hex8[1] ?? "").slice(6, 8), 16) / 255;
  return null;
}

/** Does a colour token name pure white / pure black (ignoring its alpha)? */
function isPureWhite(token: string): boolean {
  return /\bwhite\b|#fff(?:f{0,5})\b|rgba?\(\s*255\s*,\s*255\s*,\s*255|hsla?\(\s*0\s*,\s*0%\s*,\s*100%/i.test(token);
}
function isPureBlack(token: string): boolean {
  return /\bblack\b|#000(?:0{0,5})\b|rgba?\(\s*0\s*,\s*0\s*,\s*0|hsla?\(\s*0\s*,\s*0%\s*,\s*0%/i.test(token);
}

/** Surface-tint CSS props (never `color:` — text tint is not a boundary). */
const SURFACE_PROP = /(?:background(?:-color)?|border(?:-[a-z]+)?-color|border(?:-[a-z]+)?|box-shadow|outline(?:-color)?)\s*:\s*([^;}]+)/gi;

export function checkModeInvisibleSurface(html: string): TasteFinding[] {
  const mode = detectMode(html);

  // Precision guard for mixed-mode pages (a common shape: light body, dark hero/section).
  // A single global mode cannot tell whether a given tint sits on a same-mode or an
  // opposite-mode surface, so when the page carries BOTH modes we cannot prove the
  // boundary is invisible — bail rather than risk a false positive. A white hairline is
  // correct on a dark section; a black one is correct on a light section.
  if (mode === "light" && hasDarkSurface(html)) return [];
  if (mode === "dark" && hasLightSurface(html)) return [];

  const findings: TasteFinding[] = [];
  const wantWhite = mode === "light"; // light page → white tint vanishes; dark page → black tint vanishes
  const pxLabel = wantWhite ? "white" : "black";

  // Source 1 — Tailwind opacity utilities on surface prefixes: bg/border/ring/divide-<color>/<N>.
  const utilRe = /\b(bg|border|ring|divide)-(white|black)\/(\d{1,3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = utilRe.exec(html)) !== null) {
    const color = (m[2] ?? "").toLowerCase();
    const alpha = parseInt(m[3] ?? "100", 10) / 100;
    if (alpha >= ALPHA_FLOOR) continue;
    if ((wantWhite && color !== "white") || (!wantWhite && color !== "black")) continue;
    findings.push({
      checkId: CHECK_ID, axis: "Depth/Surface", severity: "error",
      message: `${m[1]}-${color}/${m[3]} is a ~${Math.round(alpha * 100)}% ${pxLabel} surface on a ${mode}-mode document — it passes text-contrast but the boundary is invisible; use a visible ${wantWhite ? "border/shadow tinted toward the background" : "light hairline"} instead`,
      line: lineOf(html, m.index),
    });
  }

  // Source 2 — literal low-alpha white/black on a surface prop (CSS rules + inline styles).
  const css = cssRegions(html);
  SURFACE_PROP.lastIndex = 0;
  while ((m = SURFACE_PROP.exec(css)) !== null) {
    const decl = m[1] ?? "";
    const tok = /(?:rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]{8}\b/.exec(decl)?.[0];
    if (!tok) continue;
    const alpha = cssAlpha(tok);
    if (alpha === null || alpha >= ALPHA_FLOOR) continue;
    if (wantWhite ? !isPureWhite(tok) : !isPureBlack(tok)) continue;
    findings.push({
      checkId: CHECK_ID, axis: "Depth/Surface", severity: "error",
      message: `a ~${Math.round(alpha * 100)}% ${pxLabel} surface tint on a ${mode}-mode document — it passes text-contrast but the boundary is invisible; raise the alpha or tint toward the background instead`,
    });
  }

  return findings;
}
