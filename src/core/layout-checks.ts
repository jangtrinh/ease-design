/**
 * Individual check functions for the static HTML layout linter.
 *
 * Each function takes the raw HTML string and returns zero or more findings.
 * All checks are pure string/regex heuristics — no DOM parser, no browser.
 * Documented as heuristic where approximation is intentional.
 */
import type { LayoutFinding } from "./layout-lint.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return 1-based line number for a match at byte offset `idx`. */
function lineOf(html: string, idx: number): number {
  return html.slice(0, idx).split("\n").length;
}

// ─── Error-severity checks ────────────────────────────────────────────────────

/** missing-doctype: no <!doctype html> at the start of the file. */
export function checkMissingDoctype(html: string): LayoutFinding[] {
  if (/^\s*<!doctype\s+html/i.test(html)) return [];
  return [{ checkId: "missing-doctype", severity: "warning",
    message: "Document is missing <!doctype html> — quirks-mode rendering may cause layout drift" }];
}

/** missing-html-root: no <html tag present. */
export function checkMissingHtmlRoot(html: string): LayoutFinding[] {
  if (/<html[\s>]/i.test(html)) return [];
  return [{ checkId: "missing-html-root", severity: "error",
    message: "Document has no <html> tag — not a valid HTML document" }];
}

/** missing-body: no <body tag present. */
export function checkMissingBody(html: string): LayoutFinding[] {
  if (/<body[\s>]/i.test(html)) return [];
  return [{ checkId: "missing-body", severity: "error",
    message: "Document has no <body> tag — content will not render" }];
}

/**
 * unclosed-structural-tag: open/close count mismatch for key structural tags.
 * Heuristic: counts <tag and </tag occurrences; ignores self-closing variants.
 * The caller (lintLayout) strips HTML comments before passing html here, so
 * commented-out tags do not inflate the counts.
 */
export function checkUnclosedStructuralTags(html: string): LayoutFinding[] {
  const TAGS = ["div","section","header","footer","main","nav","aside","article","ul","ol"];
  const findings: LayoutFinding[] = [];

  for (const tag of TAGS) {
    // Count open tags (but not self-closing <tag/>)
    const openRe = new RegExp(`<${tag}[\\s>]`, "gi");
    const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
    const opens = (html.match(openRe) ?? []).length;
    const closes = (html.match(closeRe) ?? []).length;
    if (opens !== closes) {
      findings.push({ checkId: "unclosed-structural-tag", severity: "error",
        message: `Unbalanced <${tag}> tags: ${opens} open, ${closes} close — may collapse layout` });
    }
  }
  return findings;
}

// ─── Warning-severity checks ──────────────────────────────────────────────────

/**
 * fixed-width-overflow: inline width > 1280 px or Tailwind w-[NNNNpx] > 1280.
 * Reports each occurrence with its line number.
 */
export function checkFixedWidthOverflow(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];

  // Inline style="...width: Npx..." where N > 1280
  const inlineRe = /style\s*=\s*["'][^"']*width\s*:\s*(\d+)px[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(html)) !== null) {
    const px = parseInt(m[1] ?? "0", 10);
    if (px > 1280) {
      findings.push({ checkId: "fixed-width-overflow", severity: "warning",
        message: `Inline width ${px}px exceeds 1280px — may cause horizontal scroll`,
        line: lineOf(html, m.index) });
    }
  }

  // Tailwind w-[NNNNpx] where N > 1280
  const twRe = /\bw-\[(\d+)px\]/g;
  while ((m = twRe.exec(html)) !== null) {
    const px = parseInt(m[1] ?? "0", 10);
    if (px > 1280) {
      findings.push({ checkId: "fixed-width-overflow", severity: "warning",
        message: `Tailwind class w-[${px}px] exceeds 1280px — may cause horizontal scroll`,
        line: lineOf(html, m.index) });
    }
  }

  return findings;
}

/** viewport-unit-on-body: <body> or <html> with inline width:100vw or class w-screen. */
export function checkViewportUnitOnBody(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const tagRe = /<(body|html)([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2] ?? "";
    const hasVw = /width\s*:\s*100vw/i.test(attrs);
    const hasScreen = /\bw-screen\b/.test(attrs);
    if (hasVw || hasScreen) {
      const detail = hasVw ? "width:100vw" : "w-screen";
      findings.push({ checkId: "viewport-unit-on-body", severity: "warning",
        message: `<${m[1]}> uses ${detail} — ignores scrollbar width and causes horizontal overflow`,
        line: lineOf(html, m.index) });
    }
  }
  return findings;
}

/**
 * nested-scroll-container: 2+ elements with overflow:auto/scroll or
 * overflow-auto/overflow-scroll Tailwind classes.
 * Heuristic: counts total occurrences; flags if ≥ 2 (cannot verify true nesting
 * without a DOM parser — documented limitation).
 */
export function checkNestedScrollContainer(html: string): LayoutFinding[] {
  const inlineScroll = (html.match(/overflow\s*:\s*(auto|scroll)/gi) ?? []).length;
  const twScroll = (html.match(/\boverflow-(auto|scroll)\b/g) ?? []).length;
  const total = inlineScroll + twScroll;
  if (total >= 2) {
    return [{ checkId: "nested-scroll-container", severity: "warning",
      message: `${total} scroll containers detected — nested scrollable areas may trap focus (heuristic count, not true nesting check)` }];
  }
  return [];
}

/** absolute-without-relative: position:absolute present but no position:relative anywhere. */
export function checkAbsoluteWithoutRelative(html: string): LayoutFinding[] {
  const hasAbsolute =
    /position\s*:\s*absolute/i.test(html) || /\babsolute\b/.test(html);
  if (!hasAbsolute) return [];

  const hasRelative =
    /position\s*:\s*relative/i.test(html) || /\brelative\b/.test(html);
  if (hasRelative) return [];

  return [{ checkId: "absolute-without-relative", severity: "warning",
    message: "position:absolute used but no position:relative anchor found — absolutely positioned children may escape to the viewport" }];
}

/**
 * img-no-dimensions: <img> lacking both width/height attrs and w-/h- Tailwind classes.
 * Reports each occurrence.
 */
export function checkImgNoDimensions(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const imgRe = /<img([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const hasWidth  = /\bwidth\s*=/i.test(attrs) || /\bw-\S+/.test(attrs);
    const hasHeight = /\bheight\s*=/i.test(attrs) || /\bh-\S+/.test(attrs);
    if (!hasWidth && !hasHeight) {
      findings.push({ checkId: "img-no-dimensions", severity: "warning",
        message: "<img> lacks width/height attributes and no Tailwind size class — causes layout shift (CLS)",
        line: lineOf(html, m.index) });
    }
  }
  return findings;
}

/**
 * empty-flex-grid: flex/grid display container with no child elements.
 *
 * Matches only standalone display utility classes: flex, grid, inline-flex,
 * inline-grid — bounded by whitespace or quote boundaries so that compound
 * tokens like flex-grow, flex-col, grid-cols-3 are NOT matched.
 *
 * Heuristic: if the element has text content but no child tags it is not
 * flagged — only structurally empty containers (nothing between open/close).
 */
export function checkEmptyFlexGrid(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];

  // Standalone display classes bounded by start-of-class-value, whitespace, or end-of-class-value.
  // Negative lookahead/lookbehind on [-\w] ensures we don't match partial tokens.
  const DISPLAY_RE = /(?<![A-Za-z0-9-])(?:inline-flex|inline-grid|flex|grid)(?![A-Za-z0-9-])/;

  // Match element open tag + inner content + matching close tag.
  const tagRe = /<(\w+)([^>]*\bclass\s*=\s*["'][^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2] ?? "";
    // Extract class value
    const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    if (!classMatch) continue;
    const classVal = classMatch[1] ?? "";
    if (!DISPLAY_RE.test(classVal)) continue;

    const inner = m[3] ?? "";
    // Only flag if the container has no child elements at all (inner is blank or
    // whitespace-only). Text-only content is not flagged — text is visible.
    if (inner.trim().length === 0) {
      findings.push({ checkId: "empty-flex-grid", severity: "warning",
        message: `Empty flex/grid container <${m[1]}> has no children — may appear as a collapsed region`,
        line: lineOf(html, m.index) });
    }
  }
  return findings;
}
