/**
 * Per-rule static-HTML a11y checks (see a11y-lint.ts). Each is a pure function of the
 * HTML string returning findings. Regex-based, precision-first: a rule fires only when
 * the violation is unambiguous from the markup alone.
 */
import { lineAt } from "./a11y-lint.js";
import type { A11yFinding } from "./a11y-lint.js";
import { isRedirectStub } from "./redirect-stub.js";
// Re-exported so existing importers of isRedirectStub from a11y-checks keep working —
// the detector itself now lives in redirect-stub.ts, shared with validate-layout (L4).
export { isRedirectStub } from "./redirect-stub.js";

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (m === null) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}
function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}(\\s*=|\\s|>|/)`, "i").test(tag);
}

// ── 1.1.1 Non-text content: every <img> needs an alt attribute (empty=decorative ok) ──
export function checkImgAlt(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!hasAttr(m[0], "alt")) {
      out.push({ checkId: "img-missing-alt", severity: "error", sc: "1.1.1",
        message: "<img> has no alt attribute (use alt=\"\" for decorative images)", line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 3.1.1 Language of page: <html lang="…"> present + non-empty ──
export function checkHtmlLang(html: string): A11yFinding[] {
  if (isRedirectStub(html)) return [];
  const m = /<html\b[^>]*>/i.exec(html);
  const lang = m !== null ? attr(m[0], "lang") : null;
  if (m === null || lang === null || lang.trim() === "") {
    return [{ checkId: "html-lang", severity: "error", sc: "3.1.1",
      message: "the document has no <html lang=\"…\"> — screen readers can't pick a voice", line: m !== null ? lineAt(html, m.index) : 1 }];
  }
  return [];
}

// ── 2.4.2 Page titled: non-empty <title> ──
export function checkDocumentTitle(html: string): A11yFinding[] {
  if (isRedirectStub(html)) return [];
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m === null || (m[1] ?? "").trim() === "") {
    return [{ checkId: "document-title", severity: "error", sc: "2.4.2",
      message: "the document has no non-empty <title>", line: m !== null ? lineAt(html, m.index) : 1 }];
  }
  return [];
}

// ── 2.4.3 Focus order: tabindex > 0 is an anti-pattern ──
export function checkPositiveTabindex(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/\btabindex\s*=\s*("|')?(\d+)\1?/gi)) {
    if (Number.parseInt(m[2] as string, 10) > 0) {
      out.push({ checkId: "positive-tabindex", severity: "error", sc: "2.4.3",
        message: `tabindex="${m[2]}" hijacks focus order — use 0 or -1`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 1.4.4 Resize text: viewport must not block zoom ──
export function checkViewportZoom(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*name\s*=\s*("|')?viewport\1?[^>]*>/gi)) {
    const content = attr(m[0], "content") ?? "";
    const maxScale = /maximum-scale\s*=\s*([\d.]+)/i.exec(content);
    if (/user-scalable\s*=\s*(no|0)/i.test(content) || (maxScale !== null && Number.parseFloat(maxScale[1] as string) < 2)) {
      out.push({ checkId: "viewport-zoom-blocked", severity: "error", sc: "1.4.4",
        message: "viewport blocks zoom (user-scalable=no or maximum-scale<2)", line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 4.1.2 / 2.4.4 Icon/emoji controls need an accessible name ──
const ICON_GLYPHS = "×✕✓✔▶◀▲▼☰≡⋮⋯…→←↑↓«»‹›⌄⌃✚＋−✖☆★♥♡⚙🔍";
// eslint-disable-next-line no-misleading-character-class
const EMOJI_OR_GLYPH = new RegExp(`^(?:[\\p{Extended_Pictographic}\\uFE0F\\u200D${ICON_GLYPHS}\\s]|[\\u{1F1E6}-\\u{1F1FF}])+$`, "u");

export function checkIconControlUnnamed(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  const re = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const openAttrs = m[2] ?? "";
    const inner = m[3] ?? "";
    // A programmatic name via ARIA/title exempts it.
    if (hasAttr(openAttrs, "aria-label") || hasAttr(openAttrs, "aria-labelledby") || hasAttr(openAttrs, "title")) continue;
    // A nested <img alt>/<svg><title> also names it; be conservative and skip those.
    if (/<img\b[^>]*\balt\s*=\s*("|')?[^"'\s>]+/i.test(inner) || /<title\b/i.test(inner)) continue;
    const text = inner.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim();
    if (text === "" || EMOJI_OR_GLYPH.test(text)) {
      const kind = text === "" ? "an icon-only control has no accessible name" : `an emoji/glyph ("${text}") is used as a control with no accessible name`;
      out.push({ checkId: "icon-control-unnamed", severity: "error", sc: "4.1.2",
        message: `${kind} — add aria-label (never rely on an emoji/glyph as the name)`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 1.3.1 / 2.4.6 Heading hierarchy: no skipped level, no empty heading ──
export function checkHeadingHierarchy(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  let prev = 0;
  let sawAny = false;
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const level = Number.parseInt(m[1] as string, 10);
    const text = (m[2] ?? "").replace(/<[^>]*>/g, "").trim();
    sawAny = true;
    if (text === "") {
      out.push({ checkId: "heading-empty", severity: "warning", sc: "2.4.6", message: `empty <h${level}>`, line: lineAt(html, m.index) });
    }
    if (prev > 0 && level > prev + 1) {
      out.push({ checkId: "heading-skip", severity: "warning", sc: "1.3.1",
        message: `heading jumps from h${prev} to h${level} (skips a level)`, line: lineAt(html, m.index) });
    }
    prev = level;
  }
  if (sawAny && !/<h1\b/i.test(html)) {
    out.push({ checkId: "heading-no-h1", severity: "warning", sc: "1.3.1", message: "the document has headings but no <h1>", line: 1 });
  }
  return out;
}
