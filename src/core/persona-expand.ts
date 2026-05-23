/**
 * Persona-to-token expansion: pure transform from a PersonaRecord to a
 * fully-populated TokenTree + empty Registry. No I/O.
 *
 * The token-skeleton spec (primitive + semantic layers) is locked and
 * tested with golden assertions. Do not reorder sections without updating
 * the test golden counts.
 */
import { generatePalette, STOPS } from "./color-scale.js";
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
  const shadowGroup: Record<string, { $value: ShadowComposite; $type: "shadow" }> = {
    sm: { $value: shadowSpec.sm, $type: "shadow" },
    md: { $value: shadowSpec.md, $type: "shadow" },
    lg: { $value: shadowSpec.lg, $type: "shadow" },
  };

  // ── Semantics: color ────────────────────────────────────────────────────────

  // Light-mode defaults for both "light" and "both" modes; dark-only persona swaps
  // text-body, surface, surface-raised, and border to dark neutral values.
  // colorMode "both" intentionally falls through to the light-mode defaults — the
  // semantic tokens reference neutral stops that work in either mode, and the host
  // model is expected to apply the appropriate CSS custom-property overrides at runtime.
  const isDarkOnly = persona.colorMode === "dark";

  const colorGroup: Record<string, { $value: string; $type: "color" }> = {
    "primary":          { $value: "{primary.500}",  $type: "color" },
    "primary-hover":    { $value: "{primary.600}",  $type: "color" },
    "text-body":        { $value: isDarkOnly ? "{neutral.50}"  : "{neutral.900}", $type: "color" },
    "text-muted":       { $value: "{neutral.500}",  $type: "color" },
    "text-on-primary":  { $value: "{neutral.50}",   $type: "color" },
    "surface":          { $value: isDarkOnly ? "{neutral.900}" : "{neutral.50}",  $type: "color" },
    "surface-raised":   { $value: isDarkOnly ? "{neutral.800}" : "{neutral.100}", $type: "color" },
    "border":           { $value: isDarkOnly ? "{neutral.700}" : "{neutral.200}", $type: "color" },
    "success":          { $value: "{success.500}",  $type: "color" },
    "warning":          { $value: "{warning.500}",  $type: "color" },
    "danger":           { $value: "{danger.500}",   $type: "color" },
    "info":             { $value: "{info.500}",     $type: "color" },
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
    primary,
    neutral,
    success,
    warning,
    danger,
    info,
    "space":       spaceGroup       as TokenTree[string],
    "radius":      radiusGroup      as TokenTree[string],
    "font-size":   fontSizeGroup    as TokenTree[string],
    "font-family": fontFamilyGroup  as TokenTree[string],
    "font-weight": fontWeightGroup  as TokenTree[string],
    "duration":    durationGroup    as TokenTree[string],
    "shadow":      shadowGroup      as TokenTree[string],
    // Semantics (alias layer)
    "color":     colorGroup         as TokenTree[string],
    "text":      textGroup          as TokenTree[string],
    "elevation": elevationGroup     as TokenTree[string],
    "motion":    motionGroup        as TokenTree[string],
  };

  // Merge semantic space/radius into their primitive categories so that
  // aliases like "{space.2}" and "{radius.md}" resolve correctly.
  // The space category already contains numeric steps; we add named semantics.
  for (const [k, v] of Object.entries(spaceSemanticGroup)) {
    (tokens["space"] as Record<string, unknown>)[k] = v;
  }
  for (const [k, v] of Object.entries(radiusSemanticGroup)) {
    (tokens["radius"] as Record<string, unknown>)[k] = v;
  }

  return { tokens, registry: createEmptyRegistry() };
}
