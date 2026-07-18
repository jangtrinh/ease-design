# Report — Spec 011 Phase 1: the role-recognition core

**Date**: 2026-07-18 · **Branch**: `feat/role-recognition` · **Files**: `src/core/role-recognition.ts`
(184 lines), `tests/role-recognition.test.ts` (14 tests, incl. 2 LIVE-on-dana)

## Four gates

`typecheck` / `lint` / `build` / `test` — all green. `ui knowledge check` — 0 findings. Full suite:
139 files, 2112 tests passed, 4 skipped (unrelated).

## What was built

`recognizeRoles(tree: TokenTree): { annotated, recognized, gaps, unrecognized }` — pure, zero
deps. Per token: primitive (`!isAlias`) → skip untouched. Alias matching the hue-re-export regex
(`{knownHue}-{number}`, optional `color-` prefix) → skip, no role. Alias otherwise → classify via
a weighted keyword table transcribed from `role-synonym-dictionary.md` (cited inline per role) →
`$extensions["design-os.role"]` (+ `"design-os.role-position"` when a distinct bg/fg signal
disambiguates a compound, e.g. `badge-danger-bg` → `destructive` + `bg`). Existing `$extensions`
(dana's `mode.*`) are merged, never overwritten. Every input token appears in `annotated` verbatim
— pinned by a lossless test.

## LIVE numbers (Art III)

| Project | Total tokens | Primitive | Alias (semantic) | Recognized | Unrecognized (hue / genuine) | Gaps (of 16) |
|---|---|---|---|---|---|---|
| **dana-desktop** | 414 | 186 | 228 | **154** | 74 (60 hue / **14 genuine**) | 3: `foreground`, `popover`, `input` |
| **traicaybentre** | 35 | 32 | 3 | **0** | 3 (0 hue / 3 genuine) | all 16 |
| **sodeal** | 47 | 47 | 0 | **0** | 0 | all 16 |
| **spaflow** | 33 | 33 | 0 | **0** | 0 | all 16 |

sodeal and spaflow are 100% primitive (0 aliases) — chosen as the primitive-heavy pair since they're
the most extreme case in the fixture set (traicaybentre also primitive-heavy but has 3 aliases).

**Finding — my dana number differs from the brainstorm's ~166**: I get **154 recognized**, not
~166 (74 unrecognized, not ~62). Both numbers sum correctly to 228 (154+74=228), so this isn't a
bug in totals — it's a stricter recognition rule than the brainstorm assumed. The 12-token gap is
mostly `citation-bg`/`citation-bg-active`/`citation-bg-hover`/`surface-chrome*`/`surface-overlay` —
domain-prefixed tokens where the ONLY signal is a bare position word (`-bg`/`surface-`) sitting next
to a non-role custom word (`citation`, `chrome`, `overlay`). I deliberately did NOT grant family
from a bare position word plus an unrecognized custom prefix — because the dictionary's own
"Consequences" section (point 3) cites `citation-bg` BY NAME as the example of a token with no
canonical role that must be preserved losslessly, not force-mapped. Forcing `-bg`/`-surface` alone
into `background` would have contradicted that example and silently mapped `surface-overlay` (a
scrim, per the dictionary's own "SCRIM TRAP") to a role it isn't. I'm reporting this instead of
tuning to hit 166 — my number is the real one, per the brief.

**Finding — total degradation on 100%-primitive projects (the open question in plan.md)**:
sodeal and spaflow recognize **0 tokens** — not "few", zero, because recognition only ever looks at
alias-valued tokens and neither project has any. This is the sharpest possible confirmation of the
plan's open question: name-recognition is *structurally* inert on a stock-primitive-only project;
usage-inference (deferred, MoSCoW "Could/later spec") is not an optimization for that shape, it's
the ONLY mechanism that could ever recognize anything there. traicaybentre (32 primitive + 3 alias)
shows the same floor even with a few aliases present: its 3 aliases (`dash-status-active/-done/-pending`)
carry no shadcn-shaped role word at all → 0 recognized, all 16 roles gap.

## `surface-content` / `surface-chrome` — the flagged ambiguous case (as instructed)

Tested directly on dana's real file. **Neither resolves the way the plan's worked example implies,
for two different reasons — this is the required finding, not a tuned-away edge case:**

1. **`surface-content` itself is a LITERAL in dana's real file** (`"$value": "#FFFFFF"`, no alias) —
   a **primitive**, not a semantic token, even though by convention it plays the `background` role
   (dana's own flagship "background" token). Rule 1 (primitive → no role) is unconditional on the
   `$value` shape, not the name, so it correctly gets **no annotation** — but that means the
   contract's own headline example (`surface-content → background`) does not fire on dana's real
   data at all. I pinned the *intended* behavior with a synthetic unit test (an alias-valued
   `surface-content`, which does resolve to `background`), and separately pinned dana's real,
   literal `surface-content` staying unannotated — both are correct under the letter of the
   contract, but they diverge, and that divergence is real: a hand-authored hex on a
   semantically-named token is invisible to name recognition. Worth a follow-up decision (does a
   future phase want a "looks-semantic-but-is-literal" flag?).
2. **`surface-chrome` IS an alias** (`{color.gray-900}`) but resolves to **unrecognized**, not
   `background`. Its segments are `{surface, chrome}` — `surface` is a bg-position word but `chrome`
   is a genuine domain word (dana's own name for a dark app-shell/toolbar surface, distinct from the
   light `surface-content` main background — confirmed by their values: `chrome` family is
   `gray-900`/`gray-950`, near-black; `content` family is `white`/`gray-25`/`gray-50`). Recognizing
   both as one generic `background` role would have collapsed two real, different surface concepts
   dana's DS actually distinguishes — I chose to leave `chrome` unrecognized (honest gap) rather
   than force it, per Art VIII and the explicit instruction not to guess a rule that fits one
   project.
3. **A related, resolved ambiguity I want to surface explicitly**: plan.md's compound-position rule
   text ("`surface`=bg-family, `content`=fg-position … the POSITION morpheme decides position") read
   literally would make bare `surface-content` resolve to **`foreground`**, contradicting the named
   test's own expected `background`. I resolved this by reading "content decides position" as
   applying only when attaching a *position field* to an already-established specific family (e.g.
   `badge-danger-bg`/`-text`, where fg genuinely wins ties — pinned by test), while for the
   background/foreground fallback itself (no specific family present), a bg-word among the
   meaningful segments wins the **family** call, matching the named test and matching dana's real
   `surface-content-hover`/`-active`/`-alt` (all light grays — genuinely background-shaped, not
   text-shaped; tagging them `foreground` would have been backwards). This is a judgment call on an
   internally ambiguous sentence in plan.md, made explicit here rather than silently baked in —
   flagging per Art V in case the owner wants a different resolution.

## Unresolved questions

1. Should a future phase treat a hand-authored-literal token with a semantic-looking name (like
   dana's `surface-content`) as a candidate for recognition anyway (e.g. "looks like a role but is
   a primitive" warning), or is primitive-vs-alias the correct, permanent line? Currently: no —
   strictly primitive-skip, per the contract as written.
2. `surface-chrome`/`surface-overlay`-style domain-specific surface concepts (distinct from the
   generic `background`) recur across real DSes (Atlassian's `elevation.surface.raised` vs
   `.overlay` namespace split, cited in the dictionary). Is a richer surface taxonomy (chrome/scrim/
   content as sub-roles) worth a future spec, or does usage-inference subsume it?
3. Confirmed my dana recognized count (154) differs from the brainstorm's ~166 — flagging per the
   brief rather than tuning the table to match; no action needed unless the owner wants the looser
   (bare-position-word) rule reinstated, which would re-introduce the `citation-bg` mis-map risk.
