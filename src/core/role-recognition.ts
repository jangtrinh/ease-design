/**
 * Role recognition — annotate a project's OWN tokens with the UI role they play,
 * without ever renaming them (spec 011, Phase 1: `memory: respect-their-ds-mindset`).
 * `surface-content` stays `surface-content`; this only records, via DTCG
 * `$extensions["design-os.role"]`, that it plays the `background` role. Lossless
 * (every input token verbatim, plus the annotation), pure, zero deps (Art I).
 *
 * A token's role is about its NAME/intent, not whether $value is a literal or an
 * alias — dana defines many semantic tokens as literals (`surface-content:
 * '#FFFFFF'` is still the background role). Recognition runs on EVERY token; the
 * only skip is the hue-scale name pattern (a primitive palette re-export).
 *
 * The synonym table is TRANSCRIBED from the counted dictionary —
 * specs/009-code-road/reports/role-synonym-dictionary.md (13 systems, every token
 * cited). Not a guess, unlike color-roles.ts's `ROLE_KEYWORDS` this replaces
 * ("muted"→secondary there is wrong; every entry here traces to a cited synonym). */
import { type TokenTree, type TokenGroup, type Token } from "./token-model.js";

// Canonical role vocabulary (shadcn's set, plan.md's family list).
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
  /** Genuine ties (≥2 families, equal strength) — flagged, never guessed; owner resolves via `ds set-role` (Phase 2). */
  ambiguous: string[];
}

// Hue re-export skip: a `{knownHue}-{number}` leaf (optionally `color-`
// prefixed) is a primitive palette re-export, not a UI role — dana's
// `color-blue-100` names `blue-100` literally. Counted: only hues seen in the
// corpus (blue/cyan/gray/pink/purple) are confirmed; the rest of the standard
// Tailwind + common set is speculative until seen live. The ONLY skip — value
// shape (literal vs alias) is NOT a skip condition (see module doc).
const HUE_RE =
  /^(color-)?(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|zinc|slate|stone|neutral)-\d+$/;

// Leading-prefix priority (grounded, cross-project): a LEADING surface-/bg-
// morpheme is the background family regardless of what follows — dana's
// `surface-chrome`, `surface-content` are still a surface; later words qualify
// WHICH surface, they don't flip the family. A leading text-/fg-/on- morpheme
// is foreground, mirroring Material's `on-surface` and shadcn's `-foreground`
// (`text-primary` → foreground, not `primary`+fg). Checked before the
// specific-family table and wins outright — a leading morpheme is a strong,
// cited signal, not an ambiguity.
const LEADING_BG = new Set(["surface", "bg"]);
const LEADING_FG = new Set(["text", "fg", "on"]);
// Family keywords, transcribed from role-synonym-dictionary.md. [word, weight]:
// weight 2 = the role's OWN name (a strong, self-declaring signal); weight 1 =
// a cited synonym, beatable by a stronger match on another role. "focus"→ring
// is weight 3 (dictionary consequence #4: "Map focus/outline-color/border-
// focus → ring" — border-focus is a focus ring, not a border color).
// background/foreground are NOT here — decided by the leading-prefix rule
// above, or standaloneSurface's pure-position-word fallback below. Their proxy
// words (bg/surface/text/fg) are reused everywhere as position markers, so a
// weighted hit here would wrongly grant "background" to e.g. `citation-bg` —
// the dictionary's own cited no-canonical-role example (§ Consequences, pt 3).
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
const ALL_FAMILY_ROLES = Object.keys(FAMILY_KEYWORDS) as (keyof typeof FAMILY_KEYWORDS)[];
/** The SCRIM TRAP (dictionary § point 4): overlay/scrim names the modal dimmer in
 * 5/13 systems, not the popover surface — never auto-map it to any family, even
 * under a leading surface- prefix (checked first, ahead of the prefix rule). */
const NEGATIVE_WORDS = new Set(["overlay", "scrim"]);
/** Foreground/background-position words (token-pairs.ts FOREGROUND_RE synonyms, + "on-*"). */
const POSITION_FG = new Set(["foreground", "text", "fg", "content", "ink", "on"]);
const POSITION_BG = new Set(["background", "bg", "surface", "fill"]);
/** Pure state/scaffolding words that carry no role signal by themselves. */
const NOISE = new Set(["color", "default", "hover", "active", "alt"]);

function segments(name: string): string[] {
  return name.toLowerCase().split(/[-_.]/).filter(Boolean);
}

/** Strongest specific-family match (excl. background/foreground): the single
 * winner, or the tied role list when ≥2 roles hit the same max weight (a
 * genuine ambiguity — never silently tie-broken). */
function classifyFamily(segs: readonly string[]): Role | Role[] | null {
  let maxWeight = 0;
  let winners: Role[] = [];
  for (const role of ALL_FAMILY_ROLES) {
    const weight = Math.max(0, ...FAMILY_KEYWORDS[role].filter(([w]) => segs.includes(w)).map(([, wt]) => wt));
    if (weight === 0) continue;
    if (weight > maxWeight) { maxWeight = weight; winners = [role]; }
    else if (weight === maxWeight) { winners.push(role); }
  }
  if (winners.length === 0) return null;
  return winners.length === 1 ? (winners[0] as Role) : winners;
}

/** background/foreground fallback (no leading trigger fired): only when EVERY
 * meaningful segment (noise stripped) is itself a position word — `citation-bg`
 * carries a domain word alongside the position word, must not be forced. */
function standaloneSurface(segs: readonly string[]): Role | null {
  const meaningful = segs.filter((s) => !NOISE.has(s));
  if (meaningful.length === 0) return null;
  if (!meaningful.every((s) => POSITION_BG.has(s) || POSITION_FG.has(s))) return null;
  if (meaningful.some((s) => POSITION_BG.has(s))) return "background";
  if (meaningful.some((s) => POSITION_FG.has(s))) return "foreground";
  return null;
}

/** Position (bg/fg); FG wins a tie (a name with both a surface- and text-word). */
function classifyPosition(segs: readonly string[]): "fg" | "bg" | null {
  if (segs.some((s) => POSITION_FG.has(s))) return "fg";
  if (segs.some((s) => POSITION_BG.has(s))) return "bg";
  return null;
}

type Classification =
  | { kind: "role"; family: Role; position: "fg" | "bg" | null }
  | { kind: "ambiguous"; families: Role[] }
  | { kind: "none" };

// Classify one leaf name. Order: negative trap → leading prefix (decisive) →
// specific-family table (single winner, or a flagged tie) → standalone
// background/foreground fallback → unrecognized.
function classify(name: string): Classification {
  const segs = segments(name);
  if (segs.some((s) => NEGATIVE_WORDS.has(s))) return { kind: "none" };
  const leading = segs[0];
  if (leading !== undefined && LEADING_BG.has(leading)) return { kind: "role", family: "background", position: null };
  if (leading !== undefined && LEADING_FG.has(leading)) return { kind: "role", family: "foreground", position: null };
  const specific = classifyFamily(segs);
  if (Array.isArray(specific)) return { kind: "ambiguous", families: specific };
  if (specific !== null) return { kind: "role", family: specific, position: classifyPosition(segs) };
  const surface = standaloneSurface(segs);
  if (surface !== null) return { kind: "role", family: surface, position: null };
  return { kind: "none" };
}

/** The pure entry point: annotate every token in `tree` (by NAME, regardless of
 * literal/alias $value) with the role it plays. Only hue re-exports get no
 * role. Never renames, drops, or injects — `annotated` carries every input
 * token verbatim, plus `$extensions`. */
export function recognizeRoles(tree: TokenTree): RecognitionResult {
  const annotated: TokenTree = {};
  const foundRoles = new Set<Role>();
  const unrecognized: string[] = [];
  const ambiguous: string[] = [];
  let recognized = 0;

  for (const [category, group] of Object.entries(tree)) {
    const outGroup: TokenGroup = {};
    for (const [name, token] of Object.entries(group)) {
      const path = `${category}.${name}`;
      if (HUE_RE.test(name)) {
        outGroup[name] = token; // hue re-export — no role, correctly
        unrecognized.push(path);
        continue;
      }
      const hit = classify(name);
      if (hit.kind === "ambiguous") {
        outGroup[name] = token;
        ambiguous.push(path);
        continue;
      }
      if (hit.kind === "none") {
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
  return { annotated, recognized, gaps, unrecognized, ambiguous };
}
