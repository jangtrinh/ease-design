/**
 * Role recognition — annotate a project's OWN tokens with the UI role they play,
 * without ever renaming them (spec 011, Phase 1: `memory: respect-their-ds-mindset`).
 * `surface-content` stays `surface-content`; this only records, via DTCG
 * `$extensions["design-os.role"]`, that it plays the `background` role. Lossless
 * (every input token verbatim, plus the annotation), pure, zero deps (Art I).
 * A token's role is about its NAME/intent, not whether $value is a literal or an
 * alias (`surface-content: '#FFFFFF'` is still background). Runs on every COLOR
 * token (`$type: "color"`); skips are a hue-scale name and a numbered scale STEP.
 * The synonym table is TRANSCRIBED from the counted dictionary —
 * specs/009-code-road/reports/role-synonym-dictionary.md (13 systems, cited).
 * Not a guess, unlike color-roles.ts's `ROLE_KEYWORDS` this replaces. */
import { type TokenTree, type TokenGroup, type Token } from "./token-model.js";

// Canonical role vocabulary (shadcn's set).
export type Role =
  | "background" | "foreground" | "card" | "popover" | "primary" | "secondary"
  | "muted" | "accent" | "border" | "input" | "ring" | "destructive"
  | "success" | "warning" | "info" | "neutral";

export const CANONICAL_ROLES: readonly Role[] = [
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
// prefixed) is a primitive palette re-export — dana's `color-blue-100` names
// `blue-100` literally. Counted hues (blue/cyan/gray/pink/purple in dana); the
// rest of the Tailwind + common set is speculative until seen live.
const HUE_RE =
  /^(color-)?(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|zinc|slate|stone|neutral)-\d+$/;

// Scale-step skip (fix 3, measured: 174 tokens across 4 projects): a
// `{word}-{N}` leaf is a palette SCALE STEP, not a role, when N is a lightness
// value — `color-brand-500`(sodeal), `brand-25`…`-950`(dana, 120) are steps
// like `blue-500`; the word matching a role synonym doesn't make each STEP a
// role. Disjoint from Carbon/Primer 2-digit tiers (`layer-01`) and Radix's
// 1-12 scale (`accent-9`) — those ARE roles with a number, still recognized.
const LIGHTNESS_STEPS = new Set([25, 50, 75, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
const SCALE_STEP_RE = /^.+-(\d+)$/;
function isScaleStep(name: string): boolean {
  const m = SCALE_STEP_RE.exec(name);
  return m !== null && m[1] !== undefined && LIGHTNESS_STEPS.has(Number(m[1]));
}

// Leading-prefix priority (grounded, cross-project): a LEADING surface-/bg-
// morpheme is background regardless of what follows — later words qualify
// WHICH surface, they don't flip it. A leading text-/fg-/on- morpheme is
// foreground (Material's `on-surface`, shadcn's `-foreground`). Checked before
// the specific-family table and wins outright — a strong, cited signal.
const LEADING_BG = new Set(["surface", "bg"]), LEADING_FG = new Set(["text", "fg", "on"]);
// Family keywords, transcribed from role-synonym-dictionary.md. weight 2 = the
// role's OWN name (self-declaring); weight 1 = a cited synonym, beatable by a
// stronger match. "focus"→ring is weight 3 (border-focus is a focus ring, not
// a border color, dictionary consequence #4). background/foreground are NOT
// here — their proxy words are reused as position markers, so a weighted hit
// here would wrongly grant "background" to `citation-bg` (the dictionary's own
// cited no-canonical-role example).
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
// SCRIM TRAP: overlay/scrim names the modal dimmer in 5/13 systems, not the
// popover surface — never auto-map it, even under a leading surface- prefix
// (checked first; kept as-is per coordinator fix 3c, a deliberate choice).
const NEGATIVE_WORDS = new Set(["overlay", "scrim"]);
// Foreground/background-position words (token-pairs.ts FOREGROUND_RE synonyms, + "on-*").
const POSITION_FG = new Set(["foreground", "text", "fg", "content", "ink", "on"]);
const POSITION_BG = new Set(["background", "bg", "surface", "fill"]);
// Pure state/scaffolding words that carry no role signal by themselves.
const NOISE = new Set(["color", "default", "hover", "active", "alt"]);

function segments(name: string): string[] {
  return name.toLowerCase().split(/[-_.]/).filter(Boolean);
}

// Strongest specific-family match (excl. background/foreground): the single
// winner, or the tied role list when ≥2 roles hit the same max weight (a
// genuine ambiguity — never silently tie-broken).
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

// background/foreground fallback: only when EVERY meaningful segment (noise
// stripped) is a position word — `citation-bg` carries a domain word too, must not be forced.
function standaloneSurface(segs: readonly string[]): Role | null {
  const meaningful = segs.filter((s) => !NOISE.has(s));
  if (meaningful.length === 0) return null;
  if (!meaningful.every((s) => POSITION_BG.has(s) || POSITION_FG.has(s))) return null;
  if (meaningful.some((s) => POSITION_BG.has(s))) return "background";
  if (meaningful.some((s) => POSITION_FG.has(s))) return "foreground";
  return null;
}

// Position (bg/fg); FG wins a tie (a name with both a surface- and text-word).
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

// The pure entry point: annotate every COLOR token in `tree` by NAME with its
// role (non-color out of scope, fix 3b). Never renames/drops/injects.
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
      if (token.$type !== "color") {
        outGroup[name] = token; // non-color token — out of scope, untouched
        continue;
      }
      if (HUE_RE.test(name) || isScaleStep(name)) {
        outGroup[name] = token; // hue re-export / scale step — no role, correctly
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
