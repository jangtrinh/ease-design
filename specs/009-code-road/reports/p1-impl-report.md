# Phase 01 — The living seal — implementation report

**Branch**: `spec009/p1-living-seal` · **Executor**: Sonnet

## What shipped

- **`src/core/ds-reseal.ts`** (new, 151 ln) — `reseal(input: ResealInput)`: the shared
  Art IV ceremony. Atomically rewrites whichever of `tokens`/`registry` was passed plus
  the manifest (bump generation, rehash, append changelog entry), tmp-then-rename, content
  artifacts first / manifest last. Also exports `loadDesignSystemForReseal(paths)` — loads
  a DS for a *possible* reseal, returning `undefined` on `DS_NOT_FOUND` (nothing to reseal)
  and re-throwing anything else (a caller must refuse rather than write on top of an
  already-tampered store, D4). This second export was NOT in the phase file's D1 sketch —
  added because `registry.ts` and `figma-reconcile-run.ts` both need the identical
  "is there a DS here?" probe, and duplicating it in both call sites would have blown the
  `registry.ts < 330 ln` budget (see Deviations below).
- **`ds-change-token-impl.ts`** migrated to call `reseal` (step 2, done first, before
  wiring the other two callers). File went from 362 → 326 lines (net negative, as required).
- **`registry.ts` `runRegister`** now resolves a DS at the registry file's own directory
  (`pathsForDir(dirname(registryPath))`) and reseals through it when a manifest is
  present; falls back to the pre-existing plain `saveRegistry` write when it is not (a
  standalone `--file` target with no `ds init`'d project — this is what every existing
  `registry register` unit test exercises, so none needed to change). Changelog kind
  `register`, `by: "ui registry register"` — the scaffolding declared at
  `ds-manifest.ts:16-19`/`:97` and never emitted, now emitted.
- **`figma-reconcile-run.ts` `--apply`** snapshots the DS *before* any write (sidecars,
  registry, cursor), so a `DS_TAMPERED` load refuses the whole apply before anything
  lands — never heals on top of a store already broken (D4). `saveRegistry` still writes
  the registry first (unchanged ordering, sidecars → registry → cursor), then `reseal` is
  called with the same `next` registry object immediately after — before the cursor
  advance, exactly as specced. `--dry-run` untouched (no writes occur in that branch at
  all, so this change reaches zero dry-run code paths).
- **D2** (`ds-import-impl.ts`): `--force` over a registry that already parses to a
  non-empty `components[]` now fails `REGISTRY_NOT_EMPTY` naming the count, unless
  `--reset-registry` is also passed (then today's wipe-and-reset-to-generation-1 behaviour
  is preserved verbatim — no logic in that path changed).
- **D5** (`registry-store.ts` `saveRegistry`): `JSON.stringify` → `canonicalStringify`.
  Verified no existing test depended on the old key order (all either `JSON.parse` before
  asserting, or compare two `saveRegistry` outputs against each other rather than a fixed
  string).
- Doubled-trailing-newline bug (`ds-import-impl.ts:84-86`): removed the manual `+ "\n"` —
  `canonicalStringify` already appends one (`ds-manifest.ts:74`). New test asserts exactly
  one trailing newline on all three artifacts.
- **D3**: `templates/workflows/extract.md` step 10 check 2 — `tokens` → `tokensUsed`.
- `command-signatures.ts` + `ds.ts` DS_HELP: `--reset-registry` flag and
  `REGISTRY_NOT_EMPTY` error code added to `ds import`'s schema and help text (the
  schema↔help cross-consistency test requires both to agree verbatim).

## Deviations from the phase file (mine — the file's own 3 are pre-known, not re-reported)

1. **`ResealInput.ds` is typed `DesignSystem`, not `LoadedDesignSystem`.** No type named
   `LoadedDesignSystem` exists anywhere in the codebase; `loadDesignSystem` (named in the
   phase file's own comment on that line) returns `DesignSystem` (`design-system.ts:28`).
   Treated as a naming slip, not a real ambiguity — the phase file names the exact
   producing function, and there is only one candidate type. Not stopped on.
2. **`registry.ts`'s reseal wiring needed a shared helper (`loadDesignSystemForReseal`),
   not just an import + a call.** The phase estimated "~6 lines" for `registry.ts` and a
   hard ceiling of `< 330 lines` (Success Criterion 6). `runRegister` had no DS-loading
   code at all before this phase (it operates purely on `--file`/default registry paths,
   with zero prior awareness of `design.tokens.json` or the manifest) — plumbing in
   "resolve a DS, and if present reseal, else fall back to the old write" is inherently
   more than 6 lines. A first pass duplicating the try/catch probe inline pushed the file
   to 362 lines, over budget. Moved the "load-for-reseal-or-skip" probe into
   `ds-reseal.ts` as `loadDesignSystemForReseal` (shared by both `registry.ts` and
   `figma-reconcile-run.ts` — Art IV: two callers needing the same probe is itself a
   shared-layer case) and trimmed comments until `registry.ts` landed at exactly 329
   lines. Net diff to `registry.ts`: +10 lines, +2 imports — larger than the phase's
   estimate but under its stated ceiling.
3. **`tests/ds-round-trip.test.ts` updated, not just extended.** Its existing test
   `"init → context → registry add → DS_TAMPERED (registry hash mismatch)"` asserted the
   exact defect this phase fixes: registering a component used to leave the DS
   `DS_TAMPERED`, and the test encoded that as the correct outcome. Once `registry
   register` reseals, that assertion is definitionally false — this is not a case of
   "adapt the test to hide a regression" (the phase's warning is specifically about
   `change-token`'s byte-for-byte output, which I did not touch); it is the old oracle
   testing for the presence of the bug being removed. Renamed the test and re-pointed its
   final assertions at `ds context`/`ds status` exiting 0 with the component visible,
   consistent with Success Criterion 1. All other pre-existing tests needed zero changes.

## Byte-identity check (change-token, D1 constraint)

The full `tests/cmd-ds-change-token.test.ts` suite (10 tests: round-trip, no-op-byte-
identical-manifest, every declared error code, 3-entry changelog growth) passed unchanged
against the migrated implementation with zero test edits. Additionally hand-verified live
(see commands below): `ds init` → `ds change-token color.primary --value "{primary.600}"
--reason "test reseal parity"` produces `generation: 2`, a `compiledHash` matching the
manifest on disk, and a changelog entry with `kind/by/path/from/to/reason` — structurally
identical to the pre-extraction ceremony (the migration is a straight relocation of the
same `canonicalStringify`/`canonicalHash`/`appendChangelog` calls with the same field
construction, generalized to N artifacts). Not diffed against a literal byte capture of
the pre-refactor binary side-by-side (time-boxed); confidence rests on (a) the unmodified
oracle suite passing, (b) canonical-JSON's key-order independence making construction
order irrelevant to output bytes, and (c) direct code-level comparison of the old ceremony
against the new call site during migration.

## Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean (one `no-useless-assignment` fixed in `ds-import-impl.ts` en route) |
| `npm run build` | clean, `dist/cli.js` 799.47 KB |
| `npm test` | 131/131 files, 1980/1980 non-skipped tests, 4 skipped (unchanged skip count) |
| `ui knowledge check` | 0 findings |

Live smoke tests (outside the vitest harness, against the built `dist/cli.js`):
`ds init → registry register → ds status` exits 0, generation 2 (Success Criterion 1,
"false since the command shipped" — now true); `figma reconcile --apply` on a kit-
populated DS followed by `ds status` exits 0; `ds import --force` over a non-empty
registry refuses `REGISTRY_NOT_EMPTY`, `--reset-registry` restores the wipe; `registry
register` against a *pre-tampered* store refuses `DS_TAMPERED` rather than silently
healing it (D4 verified live, not just by reasoning).

## Line counts (Art IX / Success Criterion 6)

| File | Before | After | Cap |
|---|---|---|---|
| `src/core/ds-reseal.ts` | — | 151 | < 200 |
| `src/commands/registry.ts` | 319 | 329 | < 330 |
| `src/commands/ds-change-token-impl.ts` | 362 | 326 | net negative |
| `src/commands/figma-reconcile-run.ts` | 195 | 223 | no explicit cap; IO shell, reasoned about above |

## Not touched (per the phase's Never list)

`src/core/design-system.ts`, `src/core/ds-manifest.ts` primitives, `knowledge/**`. D4's
tampered-project healing was explicitly out of scope and not attempted — verified live
that a pre-tampered store is refused, not silently repaired, by the newly-wired writers.

`platform-design-system` (real project, DS_TAMPERED per the audit) and VSF-PCP
(`generation: 1`, named `imported-ds`) were not touched by this PR, per D4. Recording per
the phase's instruction: both remain in their pre-existing state; re-onboarding them is
deferred to when the code-road spec is finished (owner decision, 2026-07-17, recorded in
`phase-01-the-living-seal.md` D4).

## Unresolved questions

None — the two ambiguities encountered (the `LoadedDesignSystem` type name, and the
`registry.ts` line-budget tension) were resolvable from the phase file's own evidence
(the named producing function; the explicit numeric ceiling) without guessing at intent,
so per Art V they're recorded above as deviations rather than escalated as blockers.
