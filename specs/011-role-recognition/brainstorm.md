# Brainstorm — Spec 011: Role recognition (understand their DS, don't rename it)

**Stage**: brainstorm · **Sizing**: L · **Date**: 2026-07-18
**Governing principle** (owner, 2026-07-17): *"Respect whatever DS the user's codebase or figma
uses. Our job is helping them continue develop their DS and their design works."*
(`memory: respect-their-ds-mindset`)
**Grounded in** (all committed): `reports/role-synonym-dictionary.md` (13 systems, cited),
`reports/token-mapping-prior-art.md` (nobody has built this — verified), `reports/
generation-identity-experiment.md` (the measured gap), `token-taxonomy.md:231` (shadcn is our
role vocabulary — a de-facto convention, our choice).

## 0. The one-sentence problem

**`ds import` stores a project's tokens by their raw names and never records which token plays
which role — so generation, a11y, and gap-detection are all blind to the DS's own structure.**

Measured consequences, all this session:
- Generation invented 14 tokens (`--surface-card`) because nothing told it dana's `surface-content`
  IS the background role (`generation-identity-experiment.md`).
- `ds a11y` ran cartesian (1011 false positives) because it couldn't see dana's `-text`/`-bg` pairs
  as declared pairs — until F11 taught it one convention (#83). Recognition generalises that.
- `ds context`'s ENFORCEMENT commands "use the semantic tokens" but can't say *which token is the
  primary* — so the model guesses.

## 1. Press release

**DESIGN:OS now understands your design system in its own words.**

Point it at a codebase that calls its background `surface-content`, its danger `badge-danger`, its
text `on-surface` — whatever your team chose — and DESIGN:OS recognises the *roles* those tokens
play without renaming a single one. Your `surface-content` stays `surface-content`; the tool just
knows it's the background. Generation styles with your real tokens, the a11y audit pairs your real
foregrounds against your real surfaces, and the roles your DS is *missing* become a short list of
tokens to add — so your design system grows from real use, in your vocabulary, never ours.

## 2. What recognition IS and IS NOT (the mindset, made precise)

| IS (recognition) | IS NOT (conversion — forbidden) |
|---|---|
| annotate: "`surface-content` plays role `background`" | rename `surface-content` → `background` |
| a read layer over their tokens | a rewrite of their tokens |
| lossless — every token kept verbatim, plus a `$role` note | dropping tokens that don't fit shadcn |
| gaps surfaced for *them* to fill (`ds change-token`) | auto-injecting shadcn tokens they never chose |

The role vocabulary (shadcn's set) is the **shared interlingua** the tool reasons in — never the
names it writes back. Their names are primary; the role is an annotation.

## 3. Three recognition mechanisms — because systems encode role three ways

Measured across 13 real systems (`role-synonym-dictionary.md` §1):

1. **By name** (11/13 systems, and the built dictionary) — `surface-content` → background via the
   counted synonym set. **Ready**: the dictionary exists; `color-roles.ts ROLE_KEYWORDS` is the
   guessed seam to replace with it. F11 already proved the shape for the fg/bg pair case.
2. **By position** (Radix) — step 9 = primary, 11-12 = text. A small step→role table.
3. **By usage** (the majority case — 22–100% of corpus colours are stock primitives with NO role
   in the name) — the role is *which colour renders the primary button / the page background*.
   **This is the unbuilt hard part nobody has done** (`token-mapping-prior-art.md`). It needs a
   usage signal, not the token name.

## 4. User stories

- As a **studio designer**, I want the tool to know my `surface-content` is the background, so
  generation styles with my tokens and stops inventing `--surface-card`.
- As a **studio designer**, I want my `-text`/`-bg` (or `-fg`, `on-*`, whatever) pairs recognised,
  so a11y audits the pairs I actually declared, not 1540 combinations that never render.
- As a **studio designer**, I want the roles my DS is *missing* as a short list, so I can add them
  (`ds change-token`) in my own names — my DS grows from what generation actually needed.
- As an **open-source adopter**, I want this to work on my DS without me adopting shadcn's names —
  respect what I built.

## 5. MoSCoW

| Priority | Item | Rationale |
|---|---|---|
| **Must** | Name recognition at `ds import` — annotate each token with its `$role` via the counted dictionary; store losslessly | The ready mechanism; fixes the "which token is background" blindness; uses built artifacts |
| **Must** | Gap report — roles with no matching token, surfaced (the help-grow list) | The mindset in output; what makes the DS *grow* |
| **Must** | `ds context` emits the role annotation so generation knows the roles | Closes the loop to the measured generation gap |
| **Should** | Position recognition (Radix step→role) | Small, one table, real 3/13 |
| **Should** | Recognition feeds `ds a11y` pairing (generalise F11 beyond `-text`/`-bg`) | F11 is a special case of this; unify |
| **Could / later spec** | Usage recognition (primitives-only, the hard majority case) | Unbuilt anywhere; needs a usage signal (rendered/computed or frequency); worth its own spec |
| **Won't** | Rename any token · inject tokens the user didn't declare · convert-to-shadcn | The mindset forbids it |

## 6. Appetite & No-Gos

**Proposed appetite: the name-recognition mechanism end to end** (Must rows) — annotate on import,
surface gaps, feed context. It reuses everything built tonight and fixes three measured symptoms.
Position is a cheap add. **Usage recognition is a separate spec** — it is the unbuilt hard part and
deserves its own real-data design.

### No-Gos
1. **No renaming, ever.** Recognition annotates; it never writes a shadcn name over a user's token.
2. **No injecting undeclared tokens.** A missing role is a *report*, not an auto-add.
3. **No uncounted role list.** `ROLE_KEYWORDS` today is guessed (`muted`→secondary is wrong). The
   replacement must be the counted dictionary — the rule that paid off 5× this session.
4. **No usage-inference in this spec.** It is real but hard; forcing it in makes this L into an
   XL. Defer with a named spec.

## 7. Decisions — RESOLVED (owner, 2026-07-18)

1. **`$role` lives in DTCG `$extensions` per token** — `$extensions["design-os.role"]`. Lossless,
   DTCG-sanctioned, travels with the token, never renames it.
2. **Recognition runs at import-time, baked into the stored DS, and is EDITABLE** — so the owner
   can correct a mis-recognition (`this token is actually the accent`). A recomputed-each-read value
   could not be hand-corrected.
3. **Appetite: name + position + gap.** Usage-inference is a separate spec (the unbuilt hard part).

## 8. What the numbers say about the design (measured on dana's 414 tokens, 2026-07-18)

The naive "how many tokens get one role" looked weak (43%) — but measuring correctly reframes the
whole design:

- **186 primitives** (literal `$value`: `blue-100`, `gray-500`) → **no role, correctly.** Only
  semantic (alias-valued) tokens carry a role. Recognition runs on the semantic tier only.
- **228 semantic tokens** → **166 recognized (72%)**. The 62 "unrecognized" are `color-blue-100`
  style **Tailwind `@theme` re-exports of the primitive scale** — `{hue}-{step}`, correctly
  role-less. Excluding those, genuine-semantic recognition is ~90%.
- **"Ambiguity" is compound role, not conflict.** `badge-danger-bg` = {`destructive` family,
  `bg` position}; `badge-danger-text` = {`destructive` family, `text` position}. A semantic token
  carries a **family role** (background/primary/danger/info…) AND a **surface position** (bg vs
  fg/text) — exactly shadcn's `{role}`/`{role}-foreground` pairing, which F11 already connects.

**Design consequence**: recognition = (a) skip primitives, (b) on semantics, extract *family role*
+ *fg/bg position* from the counted dictionary, (c) `{knownHue}-{number}` → primitive-re-export,
no role. Name recognition alone covers ~90% of a real semantic DS — which validates deferring
usage-inference: it is needed for primitive-only projects (stock-Tailwind usage), not for a DS with
a real semantic tier like dana's.

## 8. Why this is the right next build

The whole session traced the value chain: onboard (built) → DS (built) → **the DS is blind to its
own roles** (this) → generation (works but invents) → distribute. Recognition is the missing link
that makes the user's own DS *legible to the tool* — the precondition for generation to use it, for
a11y to audit it, and for the DS to grow. And research proved: **nobody has built it.** It is the
green field, now scoped by the mindset to its safe, faithful form.
