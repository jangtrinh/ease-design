/**
 * Role recognition — annotate a project's OWN tokens with the UI role they play,
 * without ever renaming them (spec 011, Phase 1: `memory: respect-their-ds-mindset`).
 *
 * `surface-content` stays `surface-content`; this only records, via DTCG
 * `$extensions["design-os.role"]`, that it plays the `background` role. Lossless:
 * every input token appears in the output verbatim (same name, same $value), plus
 * the annotation. Pure, deterministic, zero deps (Art I).
 *
 * The synonym table below is TRANSCRIBED from the counted dictionary —
 * specs/009-code-road/reports/role-synonym-dictionary.md (13 real design systems,
 * every token cited to a source). It is not a guess (unlike the `ROLE_KEYWORDS` it
 * replaces in color-roles.ts — "muted"→secondary there is wrong; this table doesn't
 * repeat that mistake because every entry traces to a cited synonym).
 */
import { type TokenTree, type TokenGroup, type Token, isAlias } from "./token-model.js";

// ─── Canonical role vocabulary (shadcn's set, plan.md's family list) ──────────

export type Role =
  | "background" | "foreground" | "card" | "popover" | "primary" | "secondary"
  | "muted" | "accent" | "border" | "input" | "ring" | "destructive"
  | "success" | "warning" | "info" | "neutral";

const CANONICAL_ROLES: readonly Role[] = [
  "background", "foreground", "card", "popover", "primary", "secondary", "muted",
  "accent", "border", "input", "ring", "destructive", "success", "warning", "info", "neutral",
];

export interface RecognitionResult {
  annotated: TokenTree;
  recognized: number;
  gaps: string[];
  unrecognized: string[];
}

// ─── Step 2: hue re-export skip (Tailwind + common palette scale) ─────────────
// A `{knownHue}-{number}` leaf (optionally `color-` prefixed) is a primitive
// re-export, not a UI role — dana's `color-blue-100` aliases `blue-100` literally.
// This is itself a counted list: only hues that actually appeared in the corpus
// (blue/cyan/gray/pink/purple in dana) are confirmed; the rest of the standard
// Tailwind + common set (red/orange/…/stone) is speculative until seen live.
const HUE_RE =
  /^(color-)?(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|zinc|slate|stone|neutral)-\d+$/;

// ─── Step 3: family keywords, transcribed from role-synonym-dictionary.md ─────
// [word, weight]: weight 2 = the role's OWN name (shadcn's word, or a system's
// literal token word for it) — a strong, self-declaring signal. weight 1 = a
// cited synonym — weaker, can be beaten by a stronger match on another role.
// "focus"→ring is weight 3: the dictionary's own consequence #4 ("Map focus/
// outline-color/border-focus → ring") explicitly overrides a same-name "border"
// hit — border-focus is a focus ring, not a border color.
// NOTE: background/foreground are handled separately (see standaloneSurface) —
// their proxy words (bg/surface/text/content/fg/ink) are reused everywhere as
// pure POSITION markers (see POSITION_FG/BG), so a weighted hit here would
// wrongly grant "background" family to e.g. `citation-bg` — the dictionary's own
// cited example of a token with NO canonical role (§ "Consequences", point 3).
const FAMILY_KEYWORDS: Record<Exclude<Role, "background" | "foreground">, [string, number][]> = {
  destructive: [["destructive", 2], ["danger", 1], ["error", 1], ["critical", 1], ["negative", 1]],
  success: [["success", 2], ["positive", 1], ["valid", 1], ["ok", 1]],
  warning: [["warning", 2], ["caution", 1], ["attention", 1], ["alert", 1]],
  info: [["info", 2], ["information", 1], ["note", 1]],
  primary: [["primary", 2], ["brand", 1], ["cta", 1], ["action", 1], ["interactive", 1]],
  secondary: [["secondary", 2]],
  accent: [["accent", 2]],
  muted: [["muted", 2], ["subtle", 1], ["tertiary", 1], ["quaternary", 1], ["helper", 1], ["placeholder", 1], ["faint", 1], ["disabled", 1]],
  card: [["card", 2], ["layer", 1], ["container", 1], ["elevated", 1], ["panel", 1], ["raised", 1]],
  popover: [["popover", 2]],
  input: [["input", 2], ["field", 1], ["control", 1]],
  ring: [["ring", 2], ["focus", 3]],
  border: [["border", 2], ["outline", 1], ["divider", 1], ["stroke", 1], ["split", 1], ["rule", 1], ["separator", 1]],
  neutral: [["neutral", 2]],
};
/** Tie-break order when two roles hit the same weight (state role beats generic border). */
const PRIORITY: readonly (keyof typeof FAMILY_KEYWORDS)[] = [
  "ring", "destructive", "success", "warning", "info", "primary", "secondary",
  "accent", "muted", "card", "popover", "input", "border", "neutral",
];
/** The SCRIM TRAP (dictionary § point 4): overlay/scrim names the modal dimmer in
 * 5/13 systems, not the popover surface — never auto-map it to any family. */
const NEGATIVE_WORDS = new Set(["overlay", "scrim"]);
/** Foreground-position words (token-pairs.ts FOREGROUND_RE synonyms, + "on-*"). */
const POSITION_FG = new Set(["foreground", "text", "fg", "content", "ink", "on"]);
/** Background-position words. */
const POSITION_BG = new Set(["background", "bg", "surface", "fill"]);
/** Pure state/scaffolding words that carry no role signal by themselves. */
const NOISE = new Set(["color", "default", "hover", "active", "alt"]);

function segments(name: string): string[] {
  return name.toLowerCase().split(/[-_.]/).filter(Boolean);
}

/** Steps 3a: the strongest specific-family match (excludes background/foreground). */
function classifyFamily(segs: readonly string[]): Role | null {
  if (segs.some((s) => NEGATIVE_WORDS.has(s))) return null;
  let best: { role: Role; weight: number } | null = null;
  for (const role of PRIORITY) {
    const words = FAMILY_KEYWORDS[role];
    const weight = Math.max(0, ...words.filter(([w]) => segs.includes(w)).map(([, wt]) => wt));
    if (weight > 0 && (best === null || weight > best.weight)) best = { role, weight };
  }
  return best?.role ?? null;
}

/** Step 3b: background/foreground only when EVERY meaningful segment (after
 * stripping noise) is itself a position word — a compound like `surface-chrome`
 * or `citation-bg` carries a domain word alongside the position word and must
 * NOT be forced into background/foreground (see the module doc + Phase 1
 * report). `surface-content` (both a bg-word and an fg-word, no domain word)
 * is the plan's own worked example: "surface" is the bg-FAMILY morpheme, so
 * background wins here — the fg-word ("content") only decides POSITION when a
 * position is being attached to an already-established specific family (see
 * classifyPosition below); it does not flip background↔foreground on its own. */
function standaloneSurface(segs: readonly string[]): Role | null {
  const meaningful = segs.filter((s) => !NOISE.has(s));
  if (meaningful.length === 0) return null;
  const allPositional = meaningful.every((s) => POSITION_BG.has(s) || POSITION_FG.has(s));
  if (!allPositional) return null;
  if (meaningful.some((s) => POSITION_BG.has(s))) return "background";
  if (meaningful.some((s) => POSITION_FG.has(s))) return "foreground";
  return null;
}

/** Position (bg/fg), independent of which segment decided the family. FG wins a
 * tie (plan.md: "surface-content" — content, the position morpheme, decides). */
function classifyPosition(segs: readonly string[]): "fg" | "bg" | null {
  if (segs.some((s) => POSITION_FG.has(s))) return "fg";
  if (segs.some((s) => POSITION_BG.has(s))) return "bg";
  return null;
}

/** Classify one leaf name → { family, position } or null (unrecognized). */
function classify(name: string): { family: Role; position: "fg" | "bg" | null } | null {
  const segs = segments(name);
  const specific = classifyFamily(segs);
  if (specific !== null) {
    const pos = specific === "background" || specific === "foreground" ? null : classifyPosition(segs);
    return { family: specific, position: pos };
  }
  const surface = standaloneSurface(segs);
  if (surface !== null) return { family: surface, position: null };
  return null;
}

// ─── The pure entry point ──────────────────────────────────────────────────────

/**
 * Annotate every semantic (alias-valued) token in `tree` with the role it plays,
 * from the counted synonym dictionary. Primitives and hue re-exports get no
 * role. Never renames, drops, or injects a token — `annotated` carries every
 * input token verbatim, plus `$extensions`.
 */
export function recognizeRoles(tree: TokenTree): RecognitionResult {
  const annotated: TokenTree = {};
  const foundRoles = new Set<Role>();
  const unrecognized: string[] = [];
  let recognized = 0;

  for (const [category, group] of Object.entries(tree)) {
    const outGroup: TokenGroup = {};
    for (const [name, token] of Object.entries(group)) {
      const path = `${category}.${name}`;
      if (!isAlias(token.$value)) {
        outGroup[name] = token; // primitive — untouched
        continue;
      }
      if (HUE_RE.test(name)) {
        outGroup[name] = token; // hue re-export — no role, correctly
        unrecognized.push(path);
        continue;
      }
      const hit = classify(name);
      if (hit === null) {
        outGroup[name] = token;
        unrecognized.push(path);
        continue;
      }
      foundRoles.add(hit.family);
      recognized += 1;
      const ext: Record<string, unknown> = { ...token.$extensions, "design-os.role": hit.family };
      if (hit.position !== null) ext["design-os.role-position"] = hit.position;
      outGroup[name] = { ...token, $extensions: ext } satisfies Token;
    }
    annotated[category] = outGroup;
  }

  const gaps = CANONICAL_ROLES.filter((r) => !foundRoles.has(r));
  return { annotated, recognized, gaps, unrecognized };
}
