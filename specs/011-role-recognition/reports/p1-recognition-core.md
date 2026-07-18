# Report — Spec 011 Phase 1: the role-recognition core

**Date**: 2026-07-18 · **Branch**: `feat/role-recognition` · **Files**: `src/core/role-recognition.ts`
(198 lines), `tests/role-recognition.test.ts` (19 tests, incl. 2 LIVE-on-dana)

This report supersedes the first pass. The coordinator sent two corrections after reading the
first pass's flagged findings; both are landed and re-verified below.

## Four gates (after both corrections)

`typecheck` / `lint` / `build` / `test` — all green. `ui knowledge check` — 0 findings. Full suite:
139 files, 2117 tests passed, 4 skipped (unrelated).

## What changed from the first pass

**Fix 1 — deleted the `isAlias` primitive-skip.** A token's role is about its NAME/intent, not
whether `$value` is a literal or an alias. dana defines many semantic tokens as literals
(`surface-content: '#FFFFFF'`); the old primitive-skip dropped 126 of dana's role-named tokens,
including its own flagship background token. The only skip left is the hue-scale name pattern
(`HUE_RE`) — a real primitive palette re-export, never a UI role. Confirmed on sodeal/spaflow/
traicaybentre too: all three are 100%-or-near-100%-literal projects whose primitives are still
named `accent`, `bg-base`, `border`, `color-brand-500`, `color-danger`, `color-primary-600` —
genuinely role-shaped names sitting on literal hex values. The old skip was silently blind to all
of them.

**Fix 2 — leading-prefix priority + a new `ambiguous` bucket.** A leading `surface-`/`bg-`
morpheme is `background` regardless of what follows (`surface-chrome`, `surface-content`); a
leading `text-`/`fg-`/`on-` morpheme is `foreground` (mirrors Material's `on-surface`, shadcn's
own `-foreground`). This is checked before the specific-family table and wins outright — grounded
across the dictionary, not tuned to one project. When the specific-family table still ties (two+
roles at equal weight, e.g. `border-success`: `border` self-name vs `success` self-name, both
weight 2) the token is now added to a new `ambiguous: string[]` field — never guessed, never
silently tie-broken. `RecognitionResult` is now `{ annotated, recognized, gaps, unrecognized,
ambiguous }`.

The SCRIM TRAP negative rule (`overlay`/`scrim` never auto-maps) is checked before the leading-
prefix rule, so it still catches `surface-overlay` even though it has a leading `surface-` — this
wasn't asked for explicitly but wasn't asked to be removed either; flagging it here for visibility
since "Keep everything else" is how I read it.

## LIVE numbers (Art III, re-run after both fixes)

| Project | Total tokens | Recognized | Ambiguous | Unrecognized (hue / genuine) | Gaps (of 16) |
|---|---|---|---|---|---|
| **dana-desktop** | 414 | **232** | **10** | 172 (120 hue / 52 genuine) | 2: `popover`, `input` |
| **traicaybentre** | 35 | **22** | 0 | 13 (0 hue / 13 genuine) | 9: card, popover, input, ring, destructive, success, warning, info, neutral |
| **sodeal** | 47 | **40** | 0 | 7 (0 hue / 7 genuine) | 10: popover, secondary, muted, input, ring, destructive, success, warning, info, neutral |
| **spaflow** | 33 | **18** | 0 | 15 (0 hue / 15 genuine) | 10: background, foreground, card, popover, secondary, muted, border, input, ring, neutral |

**Not predicting or tuning to a number, per the brief — this is what it actually is.**

### The headline change: recognition on 100%-primitive projects is no longer zero

Before fix 1, sodeal/spaflow recognized **0** tokens (every token was literal, so the primitive
skip ate all of them). After fix 1, sodeal recognizes **40/47** and spaflow **18/33** — because
their primitives are genuinely named `accent`, `bg-base`, `border`, `color-brand-500`,
`color-danger`, `color-primary-*`: real role-shaped names on literal hex values, exactly the case
fix 1 was written for. traicaybentre went from 0 to **22/35** the same way. This confirms the
coordinator's diagnosis was the real bug, not a marginal one — it was the dominant source of missed
recognition on every primitive-styled project in the fixture set, not just dana.

Dana's own recognized count moved from 154 (first pass, alias-only) → **232** (all tokens by name).
The 126-token gap the coordinator measured lines up: `badge-danger-text` (`#FFFFFF`),
`text-primary`/`text-secondary`/`text-heading`, `border-default`/`border-strong`/`border-subtle`,
and dozens more of dana's literal-valued semantics are now recognized that were invisible before.

### `surface-content` / `surface-chrome` — now resolved, not flagged

Both now recognize as `background` on dana's real file: `surface-content` because fix 1 stopped
skipping its literal `#FFFFFF` value, and both because fix 2's leading `surface-` prefix rule
decides family outright ("later morphemes qualify WHICH surface, they don't flip it"). Pinned by a
LIVE test. The prefix rule is grounded in the dictionary (Material's `on-`, shadcn's `-foreground`,
and background/foreground being genuinely position-shaped roles across systems), not a one-project
tune.

### Genuine ambiguity, dana's real 10

`badge-neutral-border`, `border-success`, `color-accent-border`, `color-info-border`,
`color-success-border`, `color-warning-border`, `semantic-error-bg-subtle`,
`semantic-info-border`, `semantic-success-border`, `semantic-warning-border`. All are real ties:
e.g. `color-accent-border` has both `accent` (weight-2 self-name) and `border` (weight-2
self-name) — genuinely undecidable by name alone (is this the accent family's border, or the
border family generically tinted for accent state?). `semantic-error-bg-subtle` ties `error`
(destructive synonym, weight 1) against `subtle` (muted synonym, weight 1) — the OLD design would
have silently resolved this via an arbitrary priority order; now it's flagged for the owner to
settle via `ds set-role` in Phase 2. None of these appeared in the pre-fix report because the old
design either dropped them (primitive skip) or silently guessed one side of the tie.

### Noise observation (not fixed, flagging for Phase 2 judgment)

Recognition now runs on every token in the tree, not just `color` — so dana's 52 "genuinely
unrecognized" list includes `dimension.space-4`, `dimension.radius-lg`, `font.font-family-sans`,
`number.z-modal`, etc. None of these carry a role-shaped name, so they correctly land as
unrecognized (honest, not a false positive) — but the list is noisier than a color-only scan would
be. The instructions didn't ask for a `$type === "color"` filter and I didn't add one unasked; flag
this in case a future phase wants to scope `unrecognized` to color tokens only for readability.

## Unresolved questions

1. Should recognition scope to `$type: "color"` tokens only, to keep `unrecognized` legible (see
   noise observation above)? Currently: no, runs on every token by name.
2. The SCRIM TRAP negative check still runs ahead of the leading-prefix rule (`surface-overlay`
   stays unrecognized, not `background`) — kept from the first pass since it wasn't asked to be
   removed. Confirm this is the intended interaction, since fix 2's prefix rule is otherwise
   unconditional.
3. `border-success`-style ties (10 on dana) are real and will recur on any DS pairing a
   component-state word with a family self-name. Phase 2's `ds set-role` is the intended
   resolution path — confirming that's still the plan.
