# Report — Spec 011 Phase 2: wire role recognition into the DS commands

**Date**: 2026-07-18 · **Branch**: `feat/role-recognition-wire` (off `main` @ `dfe92a7`, which
has Phase 1's `role-recognition.ts` merged via #85)

Makes the Phase 1 recognition core user-visible: `ds import` bakes the annotation, `ds context`
surfaces it, `ds set-role` lets the owner correct it. Mindset held throughout: recognition
annotates, never renames; a gap is a report, never an auto-add.

## Files

- `src/commands/ds-import-impl.ts` (134 lines, +12) — bakes `recognizeRoles` before sealing.
- `src/commands/ds-set-role-impl.ts` (new, 137 lines) — the owner-edit path.
- `src/core/ds-context-roles.ts` (new, 69 lines) — reads the BAKED annotation; pure, no recompute.
- `src/core/ds-context.ts` (+36 lines, wiring only — the logic lives in the new helper above, per
  the instruction not to grow this file's own logic; it was already over the 200-line guideline
  before this phase, a pre-existing condition this phase did not create).
- `src/core/role-recognition.ts` — exported `CANONICAL_ROLES` (was module-private) for reuse.
- `src/core/ds-manifest.ts`, `src/core/changelog.ts` — new changelog `kind: "set-role"`.
- `src/commands/ds.ts`, `src/core/command-signatures.ts` — dispatcher wiring, help text, schema.
- Tests: `tests/cmd-ds-set-role.test.ts` (new, 9 tests), `tests/cmd-ds-context.test.ts` (+5 tests,
  roles section), `tests/cmd-ds-import.test.ts` / `tests/cmd-ingest-css-ds.test.ts` (2 existing
  assertions updated — baking is now unconditional, so tokens named `primary`/`bg`/`text-primary`
  in those fixtures gain the annotation too).

## Three wirings

1. **`ds import`** — `recognizeRoles(dtcg)` runs before `paths.tokens` is written; the seal
   (`compiledHash`) covers the annotated tree. Output gained one line:
   `N roles recognized, M gaps: <role list>`.
2. **`ds context`** — `## Roles` (role → the project's own token path(s), supports multiple
   tokens per role) and `## Missing roles` (the gap list, in the mindset's exact words: `card,
   popover (no token — add via 'ui ds change-token' in your own name)`). Reads `ds.tokens`'
   baked `$extensions["design-os.role"]` directly — never calls `recognizeRoles` again, so a
   `ds set-role` correction always wins. Omitted entirely (both sections) when no token in the
   DS carries the annotation (pre-Phase-2 imports, hand-built DSes). Wired into both the markdown
   and `--format json` (`roles`/`roleGaps` fields).
3. **`ds set-role <token.path> <role>`** — loads the DS, validates the token exists (`BAD_TOKEN`,
   reusing `registry-token-check.ts`'s existing `tokenExistsInTree`) and the role is canonical
   (`BAD_ROLE`), then mutates ONLY that token's `$extensions["design-os.role"]` and reseals via
   the shared `reseal()` ceremony (same load → mutate → reseal shape as `ds-change-token-impl.ts`).
   New changelog kind `"set-role"` records `from`/`to`. No-op (same role) short-circuits before
   reseal, matching `change-token`'s pattern.

## A LIVE finding this phase caught (Art III)

First LIVE run on dana's real 414-token DS (100 recognized) truncated the `## Missing roles` gap
list clean out of the default `--max-bytes 4096` output — the Roles section was competing with
the token table for the same byte budget and losing. Fixed by exempting Roles/Missing-roles from
the budget entirely, the same way the soul chain already is (declared metadata, not variable
data) — moved from the truncatable `build()` closure into the fixed prefix. The JSON formatter was
already exempt by construction (`variableBytes()` never included the new fields). Re-verified: no
truncation at the default budget on dana's real DS.

## Four gates

`typecheck` / `lint` / `build` / `test` (140 files, 2136 passed, 4 skipped — unrelated,
scratchpad-fixture-conditional LIVE tests) all green. `ui knowledge check` — 0 findings.

## LIVE verification (Art III) — the full loop, raw output

Ran on a scratch copy of dana's real compiled tokens
(`.../scratchpad/onboard-all/dana-desktop/design/design.tokens.json`), never written back to that
directory:

```
$ ui ds import <dana-tokens> --dir <scratch> --name dana --force
ds import: 414 token(s) [362 color, 39 dimension, 2 fontFamily, 11 number] across 4 categories → <scratch>/design
  100 roles recognized, 2 gaps: popover, input
  next: ui ds a11y --dir <scratch>  ·  ui ds status --dir <scratch>

$ ui ds context --dir <scratch> --include tokens
## Roles

- accent → color.citation-accent, color.citation-accent-hover, color.color-accent, ...
- background → color.surface-chrome, color.surface-chrome-active, color.surface-chrome-hover,
  color.surface-content, color.surface-content-active, color.surface-content-alt,
  color.surface-content-hover, color.surface-elevated, color.surface-elevated-hover
- ... (14 families total, 100 tokens)

## Missing roles

popover, input (no token — add via 'ui ds change-token' in your own name)

$ ui ds set-role color.surface-content foreground --dir <scratch>
{ "ok": true, "command": "ds set-role",
  "data": { "path": "color.surface-content", "role": "foreground", "changed": true,
            "generation": 2, "compiledHash": "sha256-d0PC1T..." } }

$ ui ds context --dir <scratch> --include tokens
- background → color.surface-chrome, color.surface-chrome-active, color.surface-chrome-hover,
  color.surface-content-active, color.surface-content-alt, color.surface-content-hover,
  color.surface-elevated, color.surface-elevated-hover        # surface-content GONE
- foreground → color.surface-content, color.text-disabled, ...  # surface-content HERE now

$ ui ds set-role color.surface-content background --dir <scratch>   # fix it back
{ "ok": true, ..., "generation": 3, ... }

$ ui ds context --dir <scratch> --include tokens
- background → ..., color.surface-content, ...    # back where it started
- foreground → color.text-disabled, ...           # (surface-content correctly removed)
```

**Confirmed: the owner edit via `set-role` survives — `ds context` never recomputes, it reads
exactly what `set-role` wrote.** Note dana's real `background` family has 9 tokens, not 1, so
after the (deliberately wrong) correction `background` degrades to 8 tokens rather than
disappearing into the gap list outright — the plan's illustrative single-token example doesn't
hold on real multi-token data, but the mechanism (owner edit sticks, nothing recomputed) is
exactly verified either way. Changelog confirmed both `set-role` entries recorded
(`Role color.surface-content: background → foreground` / `... foreground → background`).

## Explicitly out of scope

`ds a11y` still uses its own F11 special-case pairing logic, unchanged — generalizing it to
consume `recognizeRoles`/the baked annotation is a follow-up (per the task's DO NOT list), not
done here.

## Unresolved questions

- None blocking. Open follow-up (not this phase): generalize `ds a11y`'s F11 pairing to read the
  baked role annotation instead of its own regex.
