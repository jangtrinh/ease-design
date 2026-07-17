/**
 * Token emitters: resolved map → CSS custom properties, Tailwind v4 @theme,
 * or Figma Tokens Studio flat JSON.
 *
 * All emitters are pure string transforms — no I/O, no side effects.
 * Composite tokens (typography/shadow) expand to per-member CSS properties.
 */
import type { ResolvedMap, ResolvedToken } from "./token-model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a dotted token path to a CSS custom property name. "color.primary" → "--color-primary" */
function pathToCssVar(path: string): string {
  return "--" + path.replace(/\./g, "-");
}

/** Format a single scalar token value as a CSS value string. */
function scalarToCss(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Expand a composite token value to an array of [varName, cssValue] pairs.
 * E.g. a typography token at path "text.body" with members fontFamily, fontSize
 * becomes [["--text-body-font-family", "Inter"], ["--text-body-font-size", "16px"]].
 */
function expandComposite(
  path: string,
  value: Record<string, unknown>,
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [memberKey, memberVal] of Object.entries(value)) {
    const varName = pathToCssVar(path) + "-" + memberKey.replace(/([A-Z])/g, "-$1").toLowerCase();
    pairs.push([varName, scalarToCss(memberVal)]);
  }
  return pairs;
}

/** Yield all CSS var declarations for a single resolved token. */
function tokenToCssDecls(token: ResolvedToken): [string, string][] {
  if (typeof token.value === "object" && token.value !== null) {
    return expandComposite(token.path, token.value as Record<string, unknown>);
  }
  return [[pathToCssVar(token.path), scalarToCss(token.value)]];
}

/**
 * Every CSS custom-property name a resolved token map emits (composite
 * members included, e.g. "text.body" → "--text-body-font-family" AND
 * "--text-body-font-size"). The declared-token vocabulary ds-usage-lint.ts
 * checks page CSS against — same expansion emitCss/emitTailwind use, so the
 * declared set never drifts from what a real `ui tokens compile` would emit.
 */
export function declaredCssVarNames(map: ResolvedMap): Set<string> {
  const out = new Set<string>();
  for (const token of map) {
    for (const [varName] of tokenToCssDecls(token)) out.add(varName);
  }
  return out;
}

// ─── CSS emitter ──────────────────────────────────────────────────────────────

/**
 * Emit resolved tokens as CSS custom properties.
 *
 * :root {
 *   --color-primary: #3B82F6;
 *   --text-body-font-family: Inter;
 * }
 */
export function emitCss(map: ResolvedMap): string {
  const lines: string[] = [":root {"];
  for (const token of map) {
    for (const [varName, value] of tokenToCssDecls(token)) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ─── Tailwind v4 emitter ──────────────────────────────────────────────────────

/**
 * Emit resolved tokens as a Tailwind v4 CSS-first @theme block.
 *
 * @theme {
 *   --color-primary: #3B82F6;
 * }
 */
export function emitTailwind(map: ResolvedMap): string {
  const lines: string[] = ["@theme {"];
  for (const token of map) {
    for (const [varName, value] of tokenToCssDecls(token)) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ─── Figma Tokens Studio emitter ─────────────────────────────────────────────

/**
 * Emit resolved tokens in Figma Tokens Studio flat format.
 *
 * Re-nests the flat ResolvedMap back into a two-level object:
 * { category: { tokenName: { type, value } } }
 *
 * Composite token members are emitted as a nested object value.
 */
export function emitFigma(map: ResolvedMap): string {
  // Build nested structure preserving insertion order
  const root: Record<string, Record<string, unknown>> = {};

  for (const token of map) {
    const dotIdx = token.path.indexOf(".");
    if (dotIdx === -1) continue; // malformed path — skip

    const category = token.path.slice(0, dotIdx);
    const name = token.path.slice(dotIdx + 1);

    if (root[category] === undefined) {
      root[category] = {};
    }

    const figmaValue =
      typeof token.value === "object" && token.value !== null
        ? token.value
        : token.value;

    (root[category] as Record<string, unknown>)[name] = {
      type: token.type,
      value: figmaValue,
    };
  }

  return JSON.stringify(root, null, 2) + "\n";
}
