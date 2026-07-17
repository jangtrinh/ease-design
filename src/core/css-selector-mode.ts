/**
 * D2 (spec 009 P3): selector → mode. One shared table, kept separate from
 * css-token-ingest.ts to keep that file under the Art IX budget.
 *
 *   :root / @theme / html / body        → base   ($value)
 *   [data-theme="X"]                    → mode.X
 *   .dark / [data-theme="dark"]         → mode.dark
 *   @media (prefers-color-scheme: dark) → mode.dark
 *   anything else                       → unmapped (not a mode — caller lists it, doesn't drop it)
 *
 * Base is mandatory: a token whose only declaration sits under a theme selector has
 * no base value and must not be promoted (D2) — that decision lives in css-token-ingest.ts.
 */
import { sanitizeSeg } from "./figma-ds-tokens.js";

export type ModeMapping = { kind: "base" } | { kind: "modes"; names: string[] } | { kind: "unmapped" };

function classifyOne(selector: string): { kind: "base" } | { kind: "mode"; name: string } | { kind: "unmapped" } {
  const s = selector.trim();
  if (s === ":root" || s === "html" || s === "body" || /^@theme\b/.test(s)) return { kind: "base" };
  if (s === ".dark") return { kind: "mode", name: "dark" };
  const themeMatch = /^\[\s*data-theme\s*=\s*["']([^"']+)["']\s*\]$/i.exec(s);
  if (themeMatch) return { kind: "mode", name: sanitizeSeg(themeMatch[1] as string) };
  if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/i.test(s)) return { kind: "mode", name: "dark" };
  return { kind: "unmapped" };
}

/** A selector may be a comma-separated list applying one declaration to several modes
 * at once — measured on dana: `[data-theme="dark"], [data-theme="classic"], .dark { ... }`.
 * Base wins if present in the list (not seen in real data, but a safe tie-break). */
export function classifySelector(selector: string): ModeMapping {
  const parts = selector.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return { kind: "unmapped" };
  let base = false;
  const names: string[] = [];
  for (const part of parts) {
    const c = classifyOne(part);
    if (c.kind === "base") base = true;
    else if (c.kind === "mode" && !names.includes(c.name)) names.push(c.name);
  }
  if (base) return { kind: "base" };
  if (names.length > 0) return { kind: "modes", names };
  return { kind: "unmapped" };
}
