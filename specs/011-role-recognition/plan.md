# Plan — Spec 011: Role recognition

**Brainstorm**: `brainstorm.md` (decisions resolved 2026-07-18) · **Domain**: COMPLEX
**Principle**: respect their DS — recognize, never rename (`memory: respect-their-ds-mindset`)
**Reuses (built, do not rebuild)**: `role-synonym-dictionary.md` (13 systems, counted),
`token-pairs.ts` (F11 fg/bg pairing, merged), `token-model.ts` (`isAlias`), `color-roles.ts`
(the guessed `ROLE_KEYWORDS` seam to replace with the counted dictionary).

## Locked decisions (owner)

- Annotation: **`$extensions["design-os.role"]`** per token, lossless, never renames.
- Timing: **import-time, baked, editable.**
- Scope: **name + position + gap.** Usage-inference → separate spec.

## The recognition contract (measured, §8 of brainstorm)

Recognition runs on **`$type: color` tokens only** (background/primary/danger are colour roles;
`radius.button`, `font-size.md` are not — corrected 2026-07-18, they added noise).

For each colour token (**recognition keys off the NAME, not the value form**; a role token may be
literal-valued, e.g. dana's `surface-content: '#FFFFFF'`):
1. **`{anyword}-{lightnessScale}`** — N in `{25,50,75,100,150,200,300,400,500,600,700,800,900,950}`
   → **no role.** A palette scale step, whether the word is a known hue (`blue-500`) or a
   role-named hue (`brand-500`, `accent-300`, `ink-600`). **Measured: 174 such tokens across 4
   corpus projects** were being over-recognized as their role. The role lives in the un-numbered
   semantic, not each step. Do NOT skip role tiers: `layer-01`/`field-01` (Carbon, `01`/`02`) and
   Radix `accent-9` (`1`-`12`) — those numbers are disjoint from the lightness set and stay roles.
2. **Every other colour token** → recognize the role by NAME from the counted dictionary:
   - **family role**: background · foreground · card · popover · primary · secondary · muted ·
     accent · border · input · ring · destructive · success · warning · info · neutral
   - **surface position**: `bg` vs `fg`/`text` (the paired axis F11 already handles)
   - Store `$extensions["design-os.role"] = "<family>"` (+ position where it disambiguates a pair).
   - **Family disambiguation (prefix-priority, corrected 2026-07-18)**: a leading `surface-`/`bg-`
     → background; leading `text-`/`fg-`/`on-` → foreground (Material `on-surface`, dana
     `surface-content`); else strongest family morpheme + position morpheme. A token STILL matching
     two families with no prefix winner → the `ambiguous` list (owner resolves via `ds set-role`),
     NOT a guessed role.
   - A token matching NO family → `unrecognized` (honesty — do not force a role).

## Seams under test

One seam: **`recognizeRoles(tokenTree) → annotatedTree + gapReport`** (pure), driven exactly as
`ds import` will drive it. Tests observe the annotation + gap report, never internals.

## Phases — vertical slices

| Phase | Delivers | Blocked by |
|---|---|---|
| **1** | `recognizeRoles` core (pure) — annotate semantics with `$extensions` role, skip primitives + hue-re-exports, emit the gap report. Runs on dana → 166 tokens annotated, gap list of missing roles. | — |
| **2** | Wire into `ds import` (bake the annotation), `ds context` (emit roles so generation knows them), and `ds a11y` (recognition replaces F11's special-case). Owner-edit path (`ds set-role <token> <role>`). | 1 |

## Phase 1 — the recognition core (pure, testable on dana)

- **Create `src/core/role-recognition.ts`** (<200) — `recognizeRoles(tree, dict)`:
  - Replace the guessed `ROLE_KEYWORDS` with the counted dictionary from
    `role-synonym-dictionary.md` (hard-code the synonym table as data, cite the report in a
    comment — it is the counted source, not a guess).
  - **No isAlias skip** (corrected): recognize by name regardless of literal-vs-alias value.
  - Hue-scale skip (the ONLY skip): leaf matches `^(color-)?(red|orange|amber|yellow|lime|green|emerald|teal|
    cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|zinc|slate|stone|neutral)-\d+$`
    → no role. (This is itself a list — **count it**: it is the standard Tailwind + common hue set;
    note in the report which hues appeared in the corpus vs which are speculative.)
  - Family + position extraction from the dictionary.
  - Output: `{ annotated: TokenTree, recognized: n, gaps: Role[], unrecognized: string[] }`.
- **The gap report** = canonical roles (shadcn's set) with NO token recognized → the help-grow
  list. On dana, expect gaps like `card`, `popover` (the 14 invented tokens from the experiment).
- **Do NOT** rename, drop, or inject. Every input token appears in the output verbatim, plus the
  annotation. A test pins byte-identity of names/values.

### Phase 1 tests
- `test_a_primitive_gets_no_role` (`blue-100` literal → no annotation).
- `test_a_hue_reexport_gets_no_role` (`color-blue-100` alias → no annotation).
- `test_a_semantic_token_is_annotated_with_its_family_role` (`surface-content` → background).
- `test_a_compound_token_carries_family_and_position` (`badge-danger-bg` → destructive+bg).
- `test_an_unrecognized_semantic_is_listed_not_forced` (a made-up `zorp-glimble` alias → no role,
  appears in `unrecognized`).
- `test_names_and_values_are_byte_identical_after_recognition` (lossless — the mindset).
- **LIVE (Art III)**: run on dana's real `design.tokens.json` → report recognized count (expect
  ~166), the gap list, and the unrecognized list (expect ~62 hue-re-exports). Also run on
  traicaybentre + one primitive-heavy project → report how recognition degrades (this is the
  evidence for whether usage-inference is urgently needed next).

## Phase 2 — wire it in

- `ds import` bakes `recognizeRoles` output into the stored tokens.
- `ds context` emits the roles (a `## Roles` section: `background → color.surface-content`, and
  `## Missing roles` = the gap list) so generation knows which token is which.
- `ds a11y` uses the recognized fg/bg pairs (generalises F11 — F11 becomes a special case of the
  dictionary-driven recognition, not a separate regex).
- `ds set-role <token.path> <role>` — the owner-edit path (decision 2: editable). Re-seals.
- **Never** auto-inject a missing-role token — the gap report tells the owner; `ds change-token`
  is theirs to run.

## Risks

| Risk | Mitigation |
|---|---|
| The synonym table becomes a guessed list again | It is transcribed from the 13-system counted dictionary, cited. Any addition needs a corpus count (the rule that paid off 5× this session). |
| A token gets a wrong role, silently | Decision 2: editable via `ds set-role`. And the report lists every recognition for review — nothing is silent. |
| `surface-content` (surface=bg morpheme + content=fg morpheme) mis-resolves | Position rule: the LAST/most-specific position morpheme wins, and `-content`/`-text` → fg, `-bg`/`-surface` prefix → bg. Pin with a test on dana's real `surface-content`, `surface-chrome`. **If dana's real tokens don't resolve cleanly, that is a finding — report the ambiguous ones, don't guess a rule that fits one project.** |
| Recognition on a shadcn-native DS double-annotates (already named `background`) | Idempotent: `background` → role `background` is correct and stable. Test it. |
| Scope creep into usage-inference | Out (owner). A primitive-only project gets few roles + a big gap list — that is the honest signal that usage-inference is the next spec, not a reason to build it here. |

## Open question (blocks Phase 1 completion, not start)

**How badly does recognition degrade on a primitive-only / stock-Tailwind project?** The Phase 1
LIVE run on a primitive-heavy project answers it — and quantifies how urgent the usage-inference
spec is. Measure, don't assume.
