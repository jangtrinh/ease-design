/**
 * Per-rule static content/UX-writing checks (see content-lint.ts). Only rules with a
 * genuinely LOW/MED false-positive rate on UI microcopy — which is short, imperative and
 * fragmentary, so prose linters (write-good / proselint / Flesch–Kincaid) misfire and are
 * deliberately NOT included. Voice/tone *fit* stays a model judgment (curator, not here).
 * Pure functions of the HTML string.
 */
import { lineAt } from "./a11y-lint.js";

export type ContentSeverity = "error" | "warning";
export interface ContentFinding {
  checkId: string;
  severity: ContentSeverity;
  message: string;
  line?: number;
}

/** Visible text: strip tags, decode a few entities, collapse whitespace. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// ── lorem-ipsum (error) ──
export function checkLoremIpsum(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  for (const m of html.matchAll(/lorem ipsum|dolor sit amet/gi)) {
    out.push({ checkId: "lorem-ipsum", severity: "error", message: "placeholder Lorem-ipsum text shipped as copy", line: lineAt(html, m.index) });
  }
  return out;
}

// ── placeholder-copy (error) ── (TODO deliberately excluded — legit in to-do UIs)
const PLACEHOLDER = /\b(insert (?:text|copy) here|your (?:text|title|name) here|sample text|placeholder text|xxxx+|asdf|lorem)\b/gi;
export function checkPlaceholderCopy(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  for (const m of html.matchAll(PLACEHOLDER)) {
    out.push({ checkId: "placeholder-copy", severity: "error", message: `unfinished placeholder copy: "${m[0]}"`, line: lineAt(html, m.index) });
  }
  return out;
}

// ── click-here-link (warning) — WCAG 2.4.4 / F84 ──
const VAGUE_LINK = new Set(["click here", "here", "read more", "more", "link", "this", "learn more"]);
export function checkClickHereLink(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = textOf(m[1] ?? "").toLowerCase();
    if (VAGUE_LINK.has(t)) {
      out.push({ checkId: "click-here-link", severity: "warning", message: `non-descriptive link text "${t}" — a screen-reader link list needs the destination, not "${t}"`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── error-code-alone (warning) — NN/g: never expose a bare code ──
const CODE_ONLY = /^(error\s*\d+|[a-z][a-z0-9]*_error|(?:4|5)\d\d)$/i;
export function checkErrorCodeAlone(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  for (const m of html.matchAll(/<[^>]*\b(?:role\s*=\s*("|')?alert\1?|class\s*=\s*("|')?[^"'>]*\berror\b[^"'>]*\2?)[^>]*>([\s\S]*?)<\//gi)) {
    const t = textOf(m[3] ?? "");
    if (t !== "" && CODE_ONLY.test(t)) {
      out.push({ checkId: "error-code-alone", severity: "warning", message: `error region shows only a code ("${t}") — say what happened and how to recover`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── exclamation-overload (warning) ──
export function checkExclamationOverload(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  for (const m of text.matchAll(/!!+|! [^<]{0,60}?!/g)) {
    out.push({ checkId: "exclamation-overload", severity: "warning", message: "multiple exclamation marks — one is plenty; enthusiasm has a budget", line: lineAt(html, m.index) });
  }
  return out;
}

// ── insensitive-terms (warning) — ONLY the safe infra swaps ──
const INSENSITIVE: [RegExp, string][] = [
  [/\bwhitelist(ed|ing)?\b/gi, "allowlist"],
  [/\bblacklist(ed|ing)?\b/gi, "denylist"],
  [/\bmaster\/slave\b|\bslave\b/gi, "primary/replica"],
];
export function checkInsensitiveTerms(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  for (const [re, pref] of INSENSITIVE) {
    for (const m of text.matchAll(re)) {
      out.push({ checkId: "insensitive-terms", severity: "warning", message: `prefer "${pref}" over "${m[0]}"`, line: lineAt(text, m.index) });
    }
  }
  return out;
}

// ── plural-s-hack (warning) — non-ICU pluralization ──
export function checkPluralSHack(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = textOf(html);
  for (const m of text.matchAll(/\b[a-z]{2,}\(s\)/gi)) {
    out.push({ checkId: "plural-s-hack", severity: "warning", message: `"${m[0]}" is a plural hack — use a real plural (ICU MessageFormat) for i18n`, line: 1 });
  }
  return out;
}

// ── text-in-image (warning) ──
export function checkTextInImage(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = /\balt\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "";
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "";
    const looksHeadline = /(banner|hero|cta|headline|title|promo)/i.test(src);
    if (looksHeadline && alt.trim().split(/\s+/).length >= 4) {
      out.push({ checkId: "text-in-image", severity: "warning", message: "headline text baked into an image (untranslatable, unselectable) — render it as HTML text", line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── all-caps-shout (warning) — TEXT-CONTENT caps (taste-lint owns CSS-transform caps) ──
export function checkAllCapsShout(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  for (const m of text.matchAll(/\b(?:[A-Z]{4,}\s+){2,}[A-Z]{4,}\b/g)) {
    out.push({ checkId: "all-caps-shout", severity: "warning", message: `"${m[0].slice(0, 40)}…" is written in all caps — reserve caps for short labels, not sentences`, line: lineAt(text, m.index) });
  }
  return out;
}
