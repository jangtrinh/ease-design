/**
 * Token-pair accessibility — the pure a11y check the binary CAN own (DESIGN-OS T2).
 *
 * Contrast is decidable on declared token pairs with zero rendering: for every
 * text token × surface token, is the ratio ≥ AA? This catches the recurring
 * secondary-text trap (muted ~#8A on white ≈ 3.2:1 fails AA) at the DESIGN-SYSTEM
 * level, before any screen is built.
 *
 * HONESTY (load-bearing): this proves *declared token pairs* only — never rendered
 * contrast over gradients/images/alpha, never that a real screen pairs these tokens.
 * Roles are inferred from token names unless `--pairs` pins them. The impl must never
 * emit the word "accessible" from this check. Pure: no fs, no network.
 */
import { contrastRatio, classifyContrast } from "./color-scale.js";
import type { ResolvedToken } from "./token-model.js";
import { inferForegroundPairs } from "./token-pairs.js";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TEXT_RE = /(?:^|[.\-_/])(text|fg|foreground|ink|label|body|heading|title|caption|muted|secondary|placeholder|link|content)(?:[.\-_/]|$)/i;
const SURFACE_RE = /(?:^|[.\-_/])(bg|background|surface|base|canvas|paper|card|panel|fill|elevated)(?:[.\-_/]|$)/i;
/** Contrast SC 1.4.3 / 1.4.11 explicitly exempt disabled/inactive controls. */
const EXEMPT_RE = /(?:^|[.\-_/])(disabled|inactive|readonly)(?:[.\-_/]|$)/i;

/** AA for normal-size text. */
export const AA_NORMAL = 4.5;

export interface ContrastPair {
  text: string;
  surface: string;
  ratio: number;
  level: string; // AAA | AA | AA-large | fail
  passesNormalText: boolean;
  /** Set only on interaction-state pairs: which state surface ({role}-hover/-active) was checked. */
  state?: "hover" | "active";
}
export interface A11yTokenResult {
  checkedPairs: number;
  /** Count of interaction-state pairs checked ({role}-foreground × {role}-hover/-active). Paired mode only. */
  checkedStatePairs: number;
  /** True when pairs came from the cartesian name-role inference (legacy fallback). */
  inferred: boolean;
  /** How the pairs were determined: explicit --pairs, the {role}/{role}-foreground convention, or legacy inference. */
  mode: "explicit" | "paired" | "inferred";
  pairs: ContrastPair[];
  /** Interaction-state pairs ({role}-foreground on {role}-hover/-active), each carrying `state`. Paired mode only. */
  statePairs: ContrastPair[];
  failures: ContrastPair[];
  /** Tokens that look like text but carry no hex value → couldn't be checked. */
  unresolved: string[];
}

/** Interaction-state surface suffixes audited against the SAME {role}-foreground. */
const STATE_SUFFIXES = ["hover", "active"] as const;

function hexOf(t: ResolvedToken): string | null {
  return typeof t.value === "string" && HEX_RE.test(t.value) ? t.value : null;
}

/** Parse `--pairs "text.muted:bg.default,link:surface"` into [text, surface][]. */
export function parsePairs(raw: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [text, surface] = part.split(":").map((s) => s.trim());
    if (text === undefined || surface === undefined || text === "" || surface === "") {
      throw new Error(`bad --pairs entry '${part}' — expected 'textToken:surfaceToken'`);
    }
    out.push([text, surface]);
  }
  return out;
}

function pairFor(textPath: string, tv: string, surfacePath: string, sv: string): ContrastPair {
  const ratio = Math.round(contrastRatio(tv, sv) * 100) / 100;
  const level = classifyContrast(ratio);
  return { text: textPath, surface: surfacePath, ratio, level, passesNormalText: ratio >= AA_NORMAL };
}

export function checkTokenContrast(
  tokens: readonly ResolvedToken[],
  explicitPairs?: readonly [string, string][],
): A11yTokenResult {
  const byPath = new Map(tokens.map((t) => [t.path, t]));
  const pairs: ContrastPair[] = [];
  const unresolved: string[] = [];

  if (explicitPairs !== undefined && explicitPairs.length > 0) {
    for (const [tp, sp] of explicitPairs) {
      const tt = byPath.get(tp), st = byPath.get(sp);
      const tv = tt !== undefined ? hexOf(tt) : null;
      const sv = st !== undefined ? hexOf(st) : null;
      if (tv === null || sv === null) { unresolved.push(`${tp}:${sp}`); continue; }
      pairs.push(pairFor(tp, tv, sp, sv));
    }
    pairs.sort((a, b) => a.ratio - b.ratio || a.text.localeCompare(b.text));
    const failures = pairs.filter((p) => !p.passesNormalText);
    return { checkedPairs: pairs.length, checkedStatePairs: 0, inferred: false, mode: "explicit", pairs, statePairs: [], failures, unresolved: unresolved.sort() };
  }

  // Paired path (shadcn standard): check {role}-foreground on its {role} surface — the intended
  // pairs only, never the text×surface cartesian. Preferred whenever the DS carries -foreground tokens.
  const fgPairs = inferForegroundPairs(tokens.map((t) => t.path));
  if (fgPairs.length > 0) {
    const statePairs: ContrastPair[] = [];
    for (const [fp, sp] of fgPairs) {
      const tt = byPath.get(fp), st = byPath.get(sp);
      const tv = tt !== undefined ? hexOf(tt) : null;
      const sv = st !== undefined ? hexOf(st) : null;
      if (tv === null || sv === null) { unresolved.push(`${fp}:${sp}`); continue; }
      pairs.push(pairFor(fp, tv, sp, sv));
      // State-pair audit: the SAME {role}-foreground rendered on this role's interaction
      // surfaces ({role}-hover / {role}-active). Declared {role}/{role}-foreground pairs are
      // gated; these interaction surfaces were the documented blind spot (token-taxonomy.md
      // §"The paired semantic convention" — a foreground could clear on {role} yet fail on
      // {role}-hover). Same shape, folded into `failures` below so they gate identically.
      for (const state of STATE_SUFFIXES) {
        const ssp = `${sp}-${state}`;
        const sst = byPath.get(ssp);
        if (sst === undefined) continue;
        const ssv = hexOf(sst);
        if (ssv === null) { unresolved.push(`${fp}:${ssp}`); continue; }
        statePairs.push({ ...pairFor(fp, tv, ssp, ssv), state });
      }
    }
    pairs.sort((a, b) => a.ratio - b.ratio || a.text.localeCompare(b.text));
    statePairs.sort((a, b) => a.ratio - b.ratio || a.text.localeCompare(b.text) || a.surface.localeCompare(b.surface));
    // Base failures first, then state failures — both gate (exit 1) via runA11y.
    const failures = [...pairs, ...statePairs].filter((p) => !p.passesNormalText);
    return { checkedPairs: pairs.length, checkedStatePairs: statePairs.length, inferred: false, mode: "paired", pairs, statePairs, failures, unresolved: unresolved.sort() };
  }

  // Legacy inference fallback (no paired tokens): every text-role token × every surface-role token.
  // Only COLOR-typed tokens can participate in a contrast pair — filter by resolved $type BEFORE
  // the name heuristic, so a non-color token whose NAME matches (e.g. a dimension
  // "typography-sizes.text-2xl" = "24px") is never swept into `unresolved` (L5). `unresolved` then
  // lists only color-typed textish tokens that genuinely lack a hex value.
  const texts = tokens.filter((t) => t.type === "color" && TEXT_RE.test(t.path) && !EXEMPT_RE.test(t.path));
  const surfaces = tokens.filter((t) => t.type === "color" && SURFACE_RE.test(t.path) && !EXEMPT_RE.test(t.path));
  for (const tt of texts) {
    const tv = hexOf(tt);
    if (tv === null) { unresolved.push(tt.path); continue; }
    for (const st of surfaces) {
      const sv = hexOf(st);
      if (sv === null) continue;
      if (tt.path === st.path) continue;
      pairs.push(pairFor(tt.path, tv, st.path, sv));
    }
  }
  pairs.sort((a, b) => a.ratio - b.ratio || a.text.localeCompare(b.text) || a.surface.localeCompare(b.surface));
  const failures = pairs.filter((p) => !p.passesNormalText);
  return { checkedPairs: pairs.length, checkedStatePairs: 0, inferred: true, mode: "inferred", pairs, statePairs: [], failures, unresolved: [...new Set(unresolved)].sort() };
}

export function renderA11yReport(r: A11yTokenResult): string {
  const lines: string[] = [];
  if (r.checkedPairs === 0) {
    lines.push("ds a11y: no text×surface token pairs to check (name roles: text*/fg*/… vs bg*/surface*/…, or use --pairs).");
    return lines.join("\n") + "\n";
  }
  const modeNote = r.mode === "paired" ? " ({role}/{role}-foreground pairs)" : r.mode === "inferred" ? " (roles inferred from token names — cartesian; prefer -foreground pairing or --pairs)" : "";
  const stateNote = r.checkedStatePairs > 0 ? ` + ${r.checkedStatePairs} interaction-state pair(s)` : "";
  lines.push(`ds a11y: ${r.checkedPairs} text×surface pair(s) checked${modeNote}${stateNote}, ${r.failures.length} below AA (4.5:1).`);
  for (const p of r.failures) {
    const st = p.state !== undefined ? ` [${p.state}]` : "";
    lines.push(`  ✗ ${p.text} on ${p.surface}${st} — ${p.ratio}:1 (${p.level}); fails normal-text AA`);
  }
  if (r.unresolved.length > 0) {
    lines.push(`  ? not checked (no hex value / role): ${r.unresolved.join(", ")}`);
  }
  lines.push(
    r.failures.length === 0
      ? "  All checked pairs pass AA. NOTE: this verifies declared token pairs only — not rendered contrast, and not that a screen uses these pairs. It is not a conformance claim."
      : "  NOTE: declared token pairs only — not rendered contrast; not a conformance claim. Fix the token; a11y beats the style source.",
  );
  return lines.join("\n") + "\n";
}
