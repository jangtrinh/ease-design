/**
 * Style-A report renderer — shared, pure string builders for the house
 * reporting aesthetic (rule lines + bold labels + glyph status; no boxes,
 * no color reliance — see specs/019-onboarding-first-run/overview.md).
 *
 * Pure string builders only: no color, no Rich, no ANSI, ASCII-safe. The
 * single `─` rule in ruleHeader is the only box-drawing character used
 * anywhere in this module.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Static status glyphs — never an in-place spinner. */
export const GLYPH = { done: "✓", warn: "!", fail: "✗", pending: "·" } as const;

const FALLBACK_WORDMARK = "DESIGN:OS";

/**
 * Render the brand banner: the wordmark asset (templates/brand/wordmark.txt)
 * plus a blank line and the tagline. Falls back to a plain string when the
 * asset can't be read — never throws (a missing/broken templates dir must
 * not crash a command that merely wants to print a banner).
 */
export function renderBanner(
  templatesDir: string,
  tagline = "the design engine that learns in the work",
): string {
  let wordmark: string;
  try {
    wordmark = readFileSync(join(templatesDir, "brand", "wordmark.txt"), "utf8").replace(/\n+$/, "");
  } catch {
    wordmark = FALLBACK_WORDMARK;
  }
  return `${wordmark}\n\n  ${tagline}\n`;
}

/**
 * The style-A signature line: `title ` + `─` fill + ` verdict`, so the whole
 * line is `width` columns with the verdict right-aligned. Falls back to a
 * single-space separator when title+verdict already leave no room for a
 * rule of at least 1 char.
 */
export function ruleHeader(title: string, verdict = "", width = 64): string {
  if (verdict === "") {
    if (title.length >= width) return title;
    const fillLen = width - title.length - 1;
    return `${title} ${"─".repeat(fillLen)}`;
  }
  if (title.length + verdict.length >= width - 2) {
    return `${title} ${verdict}`;
  }
  const fillLen = width - title.length - verdict.length - 2;
  return `${title} ${"─".repeat(fillLen)} ${verdict}`;
}

/**
 * A static checklist row: `  [✓] label`, `  [ ] label`, `  [!] label`, or
 * `  [✗] label` (a hard failure — e.g. `ui doctor`'s required-check misses).
 * When `hint` is given and the state isn't done, a follow-up arrow line is
 * appended below it.
 */
export function checkItem(
  state: "done" | "pending" | "warn" | "fail",
  label: string,
  hint?: string,
): string {
  const bracket =
    state === "done" ? GLYPH.done : state === "warn" ? GLYPH.warn : state === "fail" ? GLYPH.fail : " ";
  let line = `  [${bracket}] ${label}`;
  if (hint !== undefined && state !== "done") {
    line += `\n        → ${hint}`;
  }
  return line;
}

/** A key/value line: `  key      value`. */
export function kv(key: string, value: string, keyWidth = 8): string {
  return `  ${key.padEnd(keyWidth)} ${value}`;
}
