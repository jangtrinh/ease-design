/**
 * Persona-to-token expansion: pure transform from a PersonaRecord to a
 * fully-populated TokenTree + empty Registry. No I/O.
 *
 * The token-skeleton spec (primitive + semantic layers) is locked and
 * tested with golden assertions. Do not reorder sections without updating
 * the test golden counts.
 */
import { generatePalette, STOPS, contrastRatio } from "./color-scale.js";
import { hexToOKLCH, oklchToHex } from "./color-convert.js";
import { createEmptyRegistry } from "./registry-store.js";
import type { PersonaRecord } from "./persona-loader.js";
import type { TokenTree } from "./token-model.js";
import type { Registry } from "./registry-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpandOptions {
  persona: PersonaRecord;
  intent: string;       // retained for future heuristics; unused by expansion
  brandHex?: string;    // overrides persona.colorPhilosophy.primaryHex
}

export interface ExpandResult {
  tokens: TokenTree;
  registry: Registry;   // always createEmptyRegistry()
}

export class ExpandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ExpandError";
    this.code = code;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * $extensions marker stamped on every semantic-layer token at expand time.
 * Survives `ds change-token` mutations (which preserve $extensions) and lets
 * the context renderer identify semantics by structure, not by value shape.
 * Critical: without this, change-token from alias → literal would silently
 * drop the token from the host-model context block.
 */
const SEMANTIC_MARKER = { ease: { layer: "semantic" as const } } as const;

/** Stamp every token in a group with the semantic marker (returns a new object). */
function withSemanticMarker<T extends Record<string, { $value: unknown; $type: string }>>(
  group: T,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(group)) {
    out[k] = { ...v, $extensions: { ...SEMANTIC_MARKER } };
  }
  return out as T;
}

// Spacing ladder multipliers (step × base px)
const SPACE_STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;

// Font-size modular scale: 8 stops from 14px base, ratio 1.125
// xs=14 sm=16 md=18 lg=20 xl=22 2xl=25 3xl=28 4xl=32 (rounded)
const FONT_SIZE_STOPS: Record<string, string> = {
  xs:  "14px",
  sm:  "16px",
  md:  "18px",
  lg:  "20px",
  xl:  "22px",
  "2xl": "25px",
  "3xl": "28px",
  "4xl": "32px",
};

// Shadow value matrix: intensity → [sm, md, lg]
// Each composite: offsetX offsetY blur spread (all in px) + color (#hex, no alpha)
// Alpha intent is reflected in the named semantic layer; primitives use #hex only.
type ShadowComposite = {
  offsetX: string; offsetY: string; blur: string; spread: string; color: string;
};

const SHADOW_MATRIX: Record<
  PersonaRecord["shadowIntensity"],
  { sm: ShadowComposite; md: ShadowComposite; lg: ShadowComposite }
> = {
  none: {
    sm: { offsetX: "0px", offsetY: "0px", blur: "0px", spread: "0px", color: "#000000" },
    md: { offsetX: "0px", offsetY: "0px", blur: "0px", spread: "0px", color: "#000000" },
    lg: { offsetX: "0px", offsetY: "0px", blur: "0px", spread: "0px", color: "#000000" },
  },
  soft: {
    sm: { offsetX: "0px", offsetY: "1px",  blur: "2px",  spread: "0px", color: "#000000" },
    md: { offsetX: "0px", offsetY: "4px",  blur: "8px",  spread: "0px", color: "#000000" },
    lg: { offsetX: "0px", offsetY: "12px", blur: "24px", spread: "0px", color: "#000000" },
  },
  medium: {
    sm: { offsetX: "0px", offsetY: "2px",  blur: "4px",  spread: "0px", color: "#000000" },
    md: { offsetX: "0px", offsetY: "8px",  blur: "16px", spread: "0px", color: "#000000" },
    lg: { offsetX: "0px", offsetY: "16px", blur: "32px", spread: "0px", color: "#000000" },
  },
  strong: {
    sm: { offsetX: "0px", offsetY: "4px",  blur: "8px",  spread: "0px", color: "#000000" },
    md: { offsetX: "0px", offsetY: "16px", blur: "32px", spread: "0px", color: "#000000" },
    lg: { offsetX: "0px", offsetY: "24px", blur: "48px", spread: "0px", color: "#000000" },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a background-tinted shadow color from the persona's neutral hue.
 *
 * The taste rubric requires "shadows tinted toward the background hue, not pure
 * black" (and `ui taste-lint` flags pure `#000000`/hard-black shadows). The DTCG
 * shadow `color` slot is `#RRGGBB` only (no alpha — see design.tokens.schema),
 * so we can't express softness via opacity here; instead we carry the hue: take
 * the neutral hex, push lightness very low and keep a little chroma, yielding a
 * near-black that still leans toward the surface hue (e.g. warm browns tint warm,
 * cool grays tint cool). Deterministic — same neutral in, same hex out.
 */
function tintedShadowHex(neutralHex: string): string {
  const { c, h } = hexToOKLCH(neutralHex);
  // Very dark (L≈0.16) but not 0; retain a hint of the neutral's chroma so the
  // shadow reads as tinted, never pure black. Hue preserved.
  const shadowL = 0.16;
  const shadowC = Math.min(c, 0.03); // subtle tint, never a colored shadow
  return oklchToHex(shadowL, shadowC, h);
}

/** Build a color-stop category from a hex base, e.g. "primary" → { "50": {…}, "100": {…}, … }. */
function buildColorCategory(hex: string): Record<string, { $value: string; $type: "color" }> {
  const palette = generatePalette(hex);
  const group: Record<string, { $value: string; $type: "color" }> = {};
  for (const stop of STOPS) {
    const shade = palette.shades[String(stop)];
    if (shade === undefined) continue;
    group[String(stop)] = { $value: shade, $type: "color" };
  }
  return group;
}

// ─── Contrast-aware foreground picking (the paired-standard key to correct a11y) ─

type ColorCat = Record<string, { $value: string; $type: "color" }>;

/** AA contrast for normal text. */
const AA_NORMAL = 4.5;
const PURE_WHITE = "#FFFFFF";

/** Resolved hex of a stop in a built color category (all STOPS are present post-generation). */
function stopHex(cat: ColorCat, stop: number): string {
  return cat[String(stop)]?.$value ?? "#000000";
}

/**
 * Does `fg` clear AA on `bg`? Rounds the ratio to 2 dp FIRST, matching `ds a11y`'s
 * own comparison exactly (ds-a11y.ts rounds before the ≥4.5 test), so the picker
 * and the auditor never disagree on a borderline pair.
 */
function clearsAA(fg: string, bg: string): boolean {
  return Math.round(contrastRatio(fg, bg) * 100) / 100 >= AA_NORMAL;
}

/**
 * Pick a NEUTRAL foreground (returns an alias `{neutral.NNN}`) whose resolved hex
 * clears AA (≥4.5:1) on EVERY provided surface hex. Tries `order` (a stop preference
 * list) and returns the first that clears on all surfaces; if none clears it returns
 * the highest-min-contrast stop (kept total + deterministic — for the neutral
 * surfaces here one always clears with wide margin).
 *
 * `order` encodes intent: a "strong" text role leads with the darkest steps (light
 * mode) so body copy is maximally readable; a "muted" role leads with mid steps so
 * it lands on the LIGHTEST neutral that still clears AA and thus stays visibly muted.
 */
function pickNeutralFg(neutral: ColorCat, surfaces: readonly string[], order: readonly number[]): string {
  let best: { stop: number; min: number } | null = null;
  for (const stop of order) {
    const hex = stopHex(neutral, stop);
    if (surfaces.every((s) => clearsAA(hex, s))) return `{neutral.${stop}}`;
    const min = Math.min(...surfaces.map((s) => contrastRatio(hex, s)));
    if (best === null || min > best.min) best = { stop, min };
  }
  return `{neutral.${(best as { stop: number }).stop}}`;
}

/**
 * Pick a contrast-safe foreground for a SATURATED surface (a primary/status `.500`
 * fill) — returns `{base.white}` or `{base.black}`.
 *
 * Pure white/black are the ONLY foreground primitives that guarantee AA on an
 * arbitrary mid-toned brand fill: the generated neutral scale caps at ~0.92 / ~0.001
 * relative luminance (neutral.50 / neutral.950) and misses AA by ~0.1 on many hues at
 * the 500 stop (measured across every persona). WCAG's overlap guarantee — white
 * clears any surface with luminance ≤ 0.183, black any ≥ 0.175 — means one of the two
 * always clears. Prefer white (convention: light text on a colored fill) when it
 * clears; else black.
 */
function pickOnColorFg(surfaceHex: string): string {
  return clearsAA(PURE_WHITE, surfaceHex) ? "{base.white}" : "{base.black}";
}

const PURE_BLACK = "#000000";

/** The on-color foreground HEX for a saturated fill — mirrors pickOnColorFg's decision. */
function onColorFgHex(surfaceHex: string): string {
  return clearsAA(PURE_WHITE, surfaceHex) ? PURE_WHITE : PURE_BLACK;
}

// ─── Interaction-state surface picking (state-pair standard: fg AA on hover/active) ─

/**
 * Preference order for an interaction-state surface step (hover/active): try the
 * conventional DARKER neighbour first (600), walk further darker, then fall back
 * LIGHTER. Whichever foreground the base pair uses, the first CLEARING step wins — so
 * the state surface never drops the paired foreground below AA. For a white foreground
 * the darker 600 always clears; for a black foreground (a light brand fill) 600 loses
 * contrast, so the walk lands on a lighter step (400) that restores it.
 */
const HOVER_STOP_ORDER = [600, 700, 800, 900, 950, 400, 300, 200, 100, 50] as const;

/**
 * Pick a `{role}-hover`/`{role}-active` state step (returns the stop number) whose resolved
 * surface keeps `fgHex` at ≥4.5:1 — the SAME foreground the `{role}` pair uses. Deterministic:
 * evaluates HOVER_STOP_ORDER and returns the first clearing step; the WCAG overlap guarantee
 * (950 clears white, 50 clears black) makes a hit certain. Extends the L7 contrast-aware picker
 * family to interaction surfaces, closing the documented state-pair gap.
 */
function pickStateStop(cat: ColorCat, fgHex: string): number {
  for (const stop of HOVER_STOP_ORDER) {
    if (clearsAA(fgHex, stopHex(cat, stop))) return stop;
  }
  return 600;
}

// ─── Accent foreground: on-brand tint first, guaranteed-AA neutral fallback ──────

/** STOPS darkest→lightest (950…50) — the on-brand accent-fg search order. */
const ACCENT_FG_ORDER: readonly number[] = [...STOPS].sort((a, b) => b - a);

/**
 * Pick the accent-surface foreground, preferring an ON-BRAND tint over a flat neutral.
 * Tries the DARKEST primary step that clears AA (≥4.5) on the accent surface — an on-brand
 * text colour that carries the hue (a near-black brand-tinted ink on a light accent, a light
 * brand step on a dark accent). If NO primary step clears (a pathological scale), falls back
 * to the guaranteed-AA neutral pick. Deterministic; returns a `{primary.NNN}` or `{neutral.NNN}`
 * alias. Exported for the fallback unit test (real scales always yield an on-brand step).
 */
export function pickAccentFg(
  primary: ColorCat, neutral: ColorCat, accentHex: string, neutralOrder: readonly number[],
): string {
  for (const stop of ACCENT_FG_ORDER) {
    if (clearsAA(stopHex(primary, stop), accentHex)) return `{primary.${stop}}`;
  }
  return pickNeutralFg(neutral, [accentHex], neutralOrder);
}

// ─── Non-text (UI) contrast: focus ring picking ─────────────────────────────────

/**
 * Non-text UI contrast floor (WCAG 1.4.11) — for focus rings, borders, and other
 * non-text affordances. Lower than the 4.5 text floor because these are not read as
 * glyphs; they only need to be perceivable against their surface.
 */
const AA_NONTEXT = 3;

/**
 * Pick a focus-ring primary stop (returns `{primary.NNN}`) that is visible on `surfaceHex`.
 *
 * A ring is a NON-TEXT affordance, so it targets the 3:1 UI floor (WCAG 1.4.11), not the
 * 4.5 text floor. Among the stops that clear 3:1 we take the one NEAREST the floor — the
 * most brand-vivid ring that is still a legible focus indicator (a much higher-contrast
 * stop would read as a hard border, not a brand ring). Falls back to the max-contrast stop
 * if — for a pathological hue — no stop reaches 3:1 (never happens in practice: the
 * palette's extreme stops always clear against the near-white/near-black background).
 * Deterministic: same palette + surface in, same stop out.
 */
function pickRingStop(primary: ColorCat, surfaceHex: string): string {
  let clearing: { stop: number; ratio: number } | null = null;
  let best: { stop: number; ratio: number } | null = null;
  for (const stop of STOPS) {
    const ratio = contrastRatio(stopHex(primary, stop), surfaceHex);
    if (best === null || ratio > best.ratio) best = { stop, ratio };
    if (ratio >= AA_NONTEXT && (clearing === null || ratio < clearing.ratio)) {
      clearing = { stop, ratio };
    }
  }
  const chosen = clearing ?? (best as { stop: number });
  return `{primary.${chosen.stop}}`;
}

// ─── Data-viz chart palette (unpaired categorical primitives) ───────────────────

/** Number of categorical chart colors the standard mandates (chart-1 … chart-5). */
const CHART_COUNT = 5;
/** Mid lightness — one legible weight for every series, readable on light or dark. */
const CHART_L = 0.62;
/** Vivid-but-broadly-in-gamut chroma; oklchToHex clamps per-hue into sRGB. */
const CHART_C = 0.14;

/**
 * Build the `chart` primitive scale (chart.1 … chart.5) — 5 hue-distinct, theme-coherent
 * data-viz colors derived from the persona's primary hue by even 72° rotation in OKLCH (a
 * classic 5-way categorical wheel). chart-1 sits on the brand hue so the first series stays
 * on-brand; lightness/chroma are held fixed so all five read at one weight. Pure function of
 * the primary hex — deterministic, no randomness; the gamut clamp inside oklchToHex reduces
 * chroma but preserves hue, so the five hues (72° apart) stay distinct.
 */
function buildChartScale(primaryHex: string): Record<string, { $value: string; $type: "color" }> {
  const { h } = hexToOKLCH(primaryHex);
  const out: Record<string, { $value: string; $type: "color" }> = {};
  for (let i = 0; i < CHART_COUNT; i++) {
    const hue = (h + (360 / CHART_COUNT) * i) % 360;
    out[String(i + 1)] = { $value: oklchToHex(CHART_L, CHART_C, hue), $type: "color" };
  }
  return out;
}

// ─── Expansion ────────────────────────────────────────────────────────────────

/**
 * Expand a PersonaRecord into a full TokenTree + empty Registry.
 * The skeleton is deterministic given the same persona + brandHex.
 */
export function expandPersona(opts: ExpandOptions): ExpandResult {
  const { persona } = opts;

  // Validate brandHex when provided
  const brandHex = opts.brandHex;
  if (brandHex !== undefined && !HEX6_RE.test(brandHex)) {
    throw new ExpandError(
      "BAD_BRAND_HEX",
      `--brand-hex '${brandHex}' must be a 6-digit hex color (#RRGGBB)`,
    );
  }

  const primaryHex = brandHex ?? persona.colorPhilosophy.primaryHex;

  // ── Primitives: color palettes ──────────────────────────────────────────────

  const primary = buildColorCategory(primaryHex);
  const neutral = buildColorCategory(persona.colorPhilosophy.neutralHex ?? "#71717A");
  const success = buildColorCategory(persona.colorPhilosophy.successHex ?? "#16A34A");
  const warning = buildColorCategory(persona.colorPhilosophy.warningHex ?? "#F59E0B");
  const danger  = buildColorCategory(persona.colorPhilosophy.dangerHex  ?? "#DC2626");
  const info    = buildColorCategory(persona.colorPhilosophy.infoHex    ?? "#0EA5E9");

  // ── Primitives: base (pure white / black) ───────────────────────────────────
  //
  // The two anchor tones every design system needs but a generated scale cannot
  // reach: pure #FFFFFF and #000000. They are the contrast fallback the paired
  // foregrounds alias for saturated fills (see pickOnColorFg). Context-free raw
  // values → primitives; the semantic tier aliases them, two-tier discipline intact.
  const baseGroup: Record<string, { $value: string; $type: "color" }> = {
    white: { $value: "#FFFFFF", $type: "color" },
    black: { $value: "#000000", $type: "color" },
  };

  // ── Primitives: chart (data-viz categorical palette) ─────────────────────────
  //
  // Five hue-distinct colors the Design-OS standard mandates for data-viz. Derived
  // deterministically from the brand hue (even 72° OKLCH rotations) so chart-1 is
  // on-brand and the set is theme-coherent. A real primitive scale → the semantic
  // `color.chart-N` aliases point here, so the two-tier discipline holds (no literal
  // colors in the semantic tier).
  const chart = buildChartScale(primaryHex);

  // ── Primitives: spacing ─────────────────────────────────────────────────────

  const spaceBase = persona.spacing.base;
  const spaceGroup: Record<string, { $value: string; $type: "dimension" }> = {};
  for (const step of SPACE_STEPS) {
    spaceGroup[String(step)] = {
      $value: `${step * spaceBase}px`,
      $type: "dimension",
    };
  }

  // ── Primitives: radius ──────────────────────────────────────────────────────

  const radiusGroup: Record<string, { $value: string; $type: "dimension" }> = {
    sm:   { $value: persona.radius.sm,   $type: "dimension" },
    md:   { $value: persona.radius.md,   $type: "dimension" },
    lg:   { $value: persona.radius.lg,   $type: "dimension" },
    full: { $value: persona.radius.full, $type: "dimension" },
  };

  // ── Primitives: font-size ───────────────────────────────────────────────────

  const fontSizeGroup: Record<string, { $value: string; $type: "dimension" }> = {};
  for (const [name, px] of Object.entries(FONT_SIZE_STOPS)) {
    fontSizeGroup[name] = { $value: px, $type: "dimension" };
  }

  // ── Primitives: font-family ─────────────────────────────────────────────────

  const fontFamilyGroup: Record<string, { $value: string; $type: "fontFamily" }> = {
    display: { $value: persona.typography.fontFamilyDisplay, $type: "fontFamily" },
    body:    { $value: persona.typography.fontFamilyBody,    $type: "fontFamily" },
  };

  // ── Primitives: font-weight ─────────────────────────────────────────────────

  const fontWeightGroup: Record<string, { $value: number; $type: "fontWeight" }> = {
    regular:  { $value: 400, $type: "fontWeight" },
    medium:   { $value: 500, $type: "fontWeight" },
    semibold: { $value: 600, $type: "fontWeight" },
    bold:     { $value: 700, $type: "fontWeight" },
  };

  // ── Primitives: duration ────────────────────────────────────────────────────

  const durationGroup: Record<string, { $value: string; $type: "duration" }> = {
    fast: { $value: "150ms", $type: "duration" },
    base: { $value: "200ms", $type: "duration" },
    slow: { $value: "300ms", $type: "duration" },
  };

  // ── Primitives: shadow ──────────────────────────────────────────────────────

  const shadowSpec = SHADOW_MATRIX[persona.shadowIntensity];
  // Tint shadows toward the persona's background hue instead of the matrix's
  // placeholder #000000 (rubric: "tinted toward the background hue, not pure
  // black"; taste-lint flags pure black). Derived from the same neutral hex the
  // surface tokens use, so shadow and surface share a hue family.
  const shadowTint = tintedShadowHex(persona.colorPhilosophy.neutralHex ?? "#71717A");
  const tintShadow = (s: ShadowComposite): ShadowComposite => ({ ...s, color: shadowTint });
  const shadowGroup: Record<string, { $value: ShadowComposite; $type: "shadow" }> = {
    sm: { $value: tintShadow(shadowSpec.sm), $type: "shadow" },
    md: { $value: tintShadow(shadowSpec.md), $type: "shadow" },
    lg: { $value: tintShadow(shadowSpec.lg), $type: "shadow" },
  };

  // ── Semantics: color (paired {role} + {role}-foreground — Design-OS standard) ─
  //
  // Every surface role ships its paired foreground (knowledge/token-taxonomy.md
  // §"The paired semantic convention"), so `ui ds a11y` audits in the deterministic
  // "paired" mode — checking {role}-foreground on its own {role}, never the legacy
  // text×surface cartesian. Each foreground is CONTRAST-AWARE: picked to clear AA
  // (≥4.5:1) on its surface, so a freshly compiled DS never lands in the a11y
  // inferred fallback (dogfood finding L7).
  //
  // Light-mode defaults serve "light" and "both"; a dark-only persona flips the
  // neutral surface/foreground ends. "both" reuses the light defaults — the host
  // model applies dark CSS-custom-property overrides at runtime.
  const isDarkOnly = persona.colorMode === "dark";

  // Resolved surface hexes the contrast picker measures against.
  const bgHex    = isDarkOnly ? stopHex(neutral, 900) : stopHex(neutral, 50);
  const cardHex  = isDarkOnly ? stopHex(neutral, 800) : stopHex(neutral, 100);
  const mutedHex = isDarkOnly ? stopHex(neutral, 700) : stopHex(neutral, 200);

  // Extended surface roles the contrast picker measures its foregrounds against.
  const secondaryHex = isDarkOnly ? stopHex(neutral, 700) : stopHex(neutral, 200);
  const popoverHex   = isDarkOnly ? stopHex(neutral, 800) : stopHex(neutral, 100);
  const sidebarHex   = isDarkOnly ? stopHex(neutral, 800) : stopHex(neutral, 100);
  // accent (and sidebar-accent) is a LIGHT primary tint in light mode / a dark primary
  // tint in dark mode — the hover/highlight surface. Its neutral foreground is picked
  // contrast-aware (dark-on-light in light mode, light-on-dark in dark), so it clears AA.
  const accentHex    = isDarkOnly ? stopHex(primary, 800) : stopHex(primary, 100);
  // The primary fill's on-color foreground hex (white or black) — the SAME foreground the
  // primary-hover state surface must keep at ≥4.5 (state-pair standard). Mirrors pickOnColorFg.
  const primaryFgHex = onColorFgHex(stopHex(primary, 500));

  // Neutral foreground preference orders. Light mode leads dark→light (strong body
  // text = darkest; muted = lightest that still clears AA); dark-only mirrors it.
  const strongOrder = isDarkOnly ? [50, 100, 200, 300, 400] : [900, 950, 800, 700, 600];
  const mutedOrder  = isDarkOnly ? [500, 400, 300, 200, 100, 50] : [500, 600, 700, 800, 900];

  const colorGroup: Record<string, { $value: string; $type: "color" }> = {
    // Bare pair — the app-default surface + its text.
    "background":         { $value: isDarkOnly ? "{neutral.900}" : "{neutral.50}",  $type: "color" },
    "foreground":         { $value: pickNeutralFg(neutral, [bgHex, cardHex], strongOrder), $type: "color" },
    // Card surface + its text.
    "card":               { $value: isDarkOnly ? "{neutral.800}" : "{neutral.100}", $type: "color" },
    "card-foreground":    { $value: pickNeutralFg(neutral, [cardHex], strongOrder),  $type: "color" },
    // Brand: primary fill + its text; primary-hover is the interaction-state surface —
    // picked CONTRAST-AWARE so primary-foreground still clears AA on it (state-pair standard).
    "primary":            { $value: "{primary.500}", $type: "color" },
    "primary-foreground": { $value: pickOnColorFg(stopHex(primary, 500)), $type: "color" },
    "primary-hover":      { $value: `{primary.${pickStateStop(primary, primaryFgHex)}}`, $type: "color" },
    // Muted/subdued surface + its (body-adjacent) text — text must also clear on background.
    "muted":              { $value: isDarkOnly ? "{neutral.700}" : "{neutral.200}", $type: "color" },
    "muted-foreground":   { $value: pickNeutralFg(neutral, [mutedHex, bgHex], mutedOrder), $type: "color" },
    // Unpaired hairline (may share muted's neutral; a theme can diverge them).
    "border":             { $value: isDarkOnly ? "{neutral.700}" : "{neutral.200}", $type: "color" },
    // Scrim — the dimming veil behind modals/drawers (unpaired, NOT a foreground). A FIXED
    // neutral-dark primitive in BOTH light and dark themes: a scrim must darken the content
    // behind the overlay, so — unlike a foreground — it must NOT flip with colorMode (a light
    // veil in dark mode would fail to dim). Components apply it through color-mix (alpha).
    "scrim":              { $value: "{neutral.950}", $type: "color" },
    // Status quartet — richer than shadcn, still standard-conformant because paired.
    "danger":             { $value: "{danger.500}",  $type: "color" },
    "danger-foreground":  { $value: pickOnColorFg(stopHex(danger, 500)),  $type: "color" },
    "success":            { $value: "{success.500}", $type: "color" },
    "success-foreground": { $value: pickOnColorFg(stopHex(success, 500)), $type: "color" },
    "info":               { $value: "{info.500}",    $type: "color" },
    "info-foreground":    { $value: pickOnColorFg(stopHex(info, 500)),    $type: "color" },
    "warning":            { $value: "{warning.500}", $type: "color" },
    "warning-foreground": { $value: pickOnColorFg(stopHex(warning, 500)), $type: "color" },
    // ── Extended surface roles (Design-OS full semantic vocabulary) ───────────
    // Secondary — a soft neutral action surface (secondary buttons, chips) + its text.
    "secondary":            { $value: isDarkOnly ? "{neutral.700}" : "{neutral.200}", $type: "color" },
    "secondary-foreground": { $value: pickNeutralFg(neutral, [secondaryHex], strongOrder), $type: "color" },
    // Accent — hover/highlight tint (a primary step) + its text. On-brand tint first: the
    // darkest primary step that clears AA on the accent surface; guaranteed-AA neutral fallback.
    "accent":               { $value: isDarkOnly ? "{primary.800}" : "{primary.100}", $type: "color" },
    "accent-foreground":    { $value: pickAccentFg(primary, neutral, accentHex, strongOrder), $type: "color" },
    // Popover — elevated overlay surface (its own role; may share card's primitive) + text.
    "popover":              { $value: isDarkOnly ? "{neutral.800}" : "{neutral.100}", $type: "color" },
    "popover-foreground":   { $value: pickNeutralFg(neutral, [popoverHex], strongOrder), $type: "color" },
    // Input — form-control border strength (unpaired): one step stronger than border.
    "input":                { $value: isDarkOnly ? "{neutral.600}" : "{neutral.300}", $type: "color" },
    // Ring — focus ring (unpaired, non-text): a primary step nearest the 3:1 UI floor on background.
    "ring":                 { $value: pickRingStop(primary, bgHex), $type: "color" },
    // ── Sidebar set (8, per the standard) — its own themeable surface family ───
    "sidebar":                    { $value: isDarkOnly ? "{neutral.800}" : "{neutral.100}", $type: "color" },
    "sidebar-foreground":         { $value: pickNeutralFg(neutral, [sidebarHex], strongOrder), $type: "color" },
    "sidebar-primary":            { $value: "{primary.500}", $type: "color" },
    "sidebar-primary-foreground": { $value: pickOnColorFg(stopHex(primary, 500)), $type: "color" },
    "sidebar-accent":             { $value: isDarkOnly ? "{primary.800}" : "{primary.100}", $type: "color" },
    "sidebar-accent-foreground":  { $value: pickAccentFg(primary, neutral, accentHex, strongOrder), $type: "color" },
    "sidebar-border":             { $value: isDarkOnly ? "{neutral.700}" : "{neutral.200}", $type: "color" },
    "sidebar-ring":               { $value: pickRingStop(primary, sidebarHex), $type: "color" },
    // ── Data-viz palette (unpaired) — aliases into the chart primitive scale ───
    "chart-1": { $value: "{chart.1}", $type: "color" },
    "chart-2": { $value: "{chart.2}", $type: "color" },
    "chart-3": { $value: "{chart.3}", $type: "color" },
    "chart-4": { $value: "{chart.4}", $type: "color" },
    "chart-5": { $value: "{chart.5}", $type: "color" },
  };

  // ── Semantics: space ────────────────────────────────────────────────────────

  const spaceSemanticGroup: Record<string, { $value: string; $type: "dimension" }> = {
    "inline":     { $value: "{space.2}",  $type: "dimension" },
    "component":  { $value: "{space.4}",  $type: "dimension" },
    "section":    { $value: "{space.10}", $type: "dimension" },
  };

  // ── Semantics: radius ───────────────────────────────────────────────────────

  const radiusSemanticGroup: Record<string, { $value: string; $type: "dimension" }> = {
    "card":   { $value: "{radius.md}", $type: "dimension" },
    "button": { $value: "{radius.sm}", $type: "dimension" },
  };

  // ── Semantics: text (typography composites) ─────────────────────────────────

  const textGroup: Record<string, { $value: Record<string, string>; $type: "typography" }> = {
    body: {
      $value: {
        fontFamily:   "{font-family.body}",
        fontSize:     "{font-size.md}",
        fontWeight:   "{font-weight.regular}",
        lineHeight:   "1.5",
        letterSpacing: "0px",
      },
      $type: "typography",
    },
    heading: {
      $value: {
        fontFamily:   "{font-family.display}",
        fontSize:     "{font-size.2xl}",
        fontWeight:   "{font-weight.semibold}",
        lineHeight:   "1.2",
        letterSpacing: "0px",
      },
      $type: "typography",
    },
    caption: {
      $value: {
        fontFamily:   "{font-family.body}",
        fontSize:     "{font-size.sm}",
        fontWeight:   "{font-weight.regular}",
        lineHeight:   "1.4",
        letterSpacing: "0px",
      },
      $type: "typography",
    },
  };

  // ── Semantics: elevation ────────────────────────────────────────────────────

  const elevationGroup: Record<string, { $value: string; $type: "shadow" }> = {
    "card":    { $value: "{shadow.sm}", $type: "shadow" },
    "overlay": { $value: "{shadow.lg}", $type: "shadow" },
  };

  // ── Semantics: motion ───────────────────────────────────────────────────────

  const motionGroup: Record<string, { $value: string; $type: "duration" }> = {
    "fast": { $value: "{duration.fast}", $type: "duration" },
    "base": { $value: "{duration.base}", $type: "duration" },
  };

  // ── Assemble TokenTree ──────────────────────────────────────────────────────

  const tokens: TokenTree = {
    // Primitives
    base: baseGroup as TokenTree[string],
    primary,
    neutral,
    success,
    warning,
    danger,
    info,
    chart,
    "space":       spaceGroup       as TokenTree[string],
    "radius":      radiusGroup      as TokenTree[string],
    "font-size":   fontSizeGroup    as TokenTree[string],
    "font-family": fontFamilyGroup  as TokenTree[string],
    "font-weight": fontWeightGroup  as TokenTree[string],
    "duration":    durationGroup    as TokenTree[string],
    "shadow":      shadowGroup      as TokenTree[string],
    // Semantics (alias layer) — stamped with $extensions.ease.layer = "semantic"
    "color":     withSemanticMarker(colorGroup)     as TokenTree[string],
    "text":      withSemanticMarker(textGroup)      as TokenTree[string],
    "elevation": withSemanticMarker(elevationGroup) as TokenTree[string],
    "motion":    withSemanticMarker(motionGroup)    as TokenTree[string],
  };

  // Merge semantic space/radius into their primitive categories so that
  // aliases like "{space.2}" and "{radius.md}" resolve correctly.
  // The space category already contains numeric steps; we add named semantics
  // with the semantic marker so the context renderer keeps them distinct.
  const markedSpaceSem  = withSemanticMarker(spaceSemanticGroup);
  const markedRadiusSem = withSemanticMarker(radiusSemanticGroup);
  for (const [k, v] of Object.entries(markedSpaceSem)) {
    (tokens["space"] as Record<string, unknown>)[k] = v;
  }
  for (const [k, v] of Object.entries(markedRadiusSem)) {
    (tokens["radius"] as Record<string, unknown>)[k] = v;
  }

  return { tokens, registry: createEmptyRegistry() };
}
