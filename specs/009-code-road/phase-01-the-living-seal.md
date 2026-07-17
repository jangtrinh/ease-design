# Phase 01 — The living seal

> **Executor: Sonnet.** This phase touches no code-road logic. It repairs a defect that is live
> on `main` today and has **two** callers nobody's world exercised. Art IV audit is **done** —
> `reports/art-iv-seal-audit.md`. Do not re-derive it; do not widen it.

## Context Links

- Spec `spec.md` §Acceptance 1-2 · Plan `plan.md` Phase 1 · Tasks `tasks.md` T1
- **The audit that shaped this phase**: `reports/art-iv-seal-audit.md` — read it first
- `brainstorm.md` R2 (root premise) · R3 (the three-name defect)
- Dogfood: `feedbacks/260717-dana-desktop-onboarding.md` F1, F3, F5
- Constitution: Art II (emitter+linter), Art IV (shared layer), Art VIII (honesty), Art IX (<200 ln)

## Overview

- **Priority**: first. **Depends**: nothing. **Blocks**: Phase 4 (and `/ui:learn`'s own gate).
- **Status**: not started.
- **Description**: the seal covers `design.tokens.json` + `component-registry.json`. Three
  writers reseal; **two do not**. Extract the reseal into one helper and give it its third
  caller. Ship the check that fails without it.

## Key Insights (each is a trap in the existing code)

1. **This is NOT a code-road bug.** `registry register` has five template callers, including
   **`generate.md` Step 7**. `/ui:generate` — the README's first verb — tampers the store it
   just wrote into and never checks. Fixing this is worth doing if spec 009 were cancelled.
2. **There are TWO unsealed writers, not one.** `figma-reconcile-run.ts:167` writes
   `["design","component-registry.json"]` (`:44`) — the exact sealed path — and the file
   contains **zero** `manifest` references. Its 14-line header covers IO ownership, purity and
   Art I.2 and says **nothing** about the seal; specs 004/005 never raised it. **No decision was
   made — it is an omission.** (Method: the "is this deliberate?" check was run and it failed to
   find a sentence. Run that check before calling anything else a hole.)
3. **`platform-design-system` is DS_TAMPERED right now** — a real project, not a fixture. Its
   `figma.changes.jsonl` holds 162 entries. **This is why the phase is an extraction**: the bug
   already escaped into production through the *second* writer.
4. **The scaffolding is already built and unused.** `ds-manifest.ts:16-19` declares changelog
   `kind: "register"` with `by: "… | ui registry register"`; `:97` admits `"register"` into
   `CHANGELOG_KINDS`. **No code path emits it.** Someone designed this and never wired the last
   connector. Do not invent a new kind.
5. **`registry.ts` is 319 lines** (Art IX). The helper does **not** go there. `registry.ts` gains
   one import and one call.
6. **The reseal is not one line.** `ds-change-token-impl.ts:300-342` is a full ceremony:
   `canonicalHash` → `appendChangelog` → write tmp → rename tokens → write manifest tmp → rename
   manifest, **plus** a recover-or-explain branch (`:338-342`) for the half-committed state. The
   extraction must carry the ceremony, not just the hash.
7. **`ingest-figma-ds` is NOT a violation.** It writes `<outDir>/component-registry.json`
   (`:167`), the **portable unsealed bundle** `onboard.md` §1 E4 describes. Only guard the
   `--out ./design` edge.
8. **F5 was a misdiagnosis** (`brainstorm.md` R3). `--tokens` **is** persisted, as `tokensUsed`.
   Do not "fix" a discard that does not exist. The defect is the naming trio.

## Decisions (RESOLVED)

### D1 — one helper, three callers, new module

`src/core/ds-reseal.ts` (~90 ln, new). Signature:

```ts
export interface ResealInput {
  ds: LoadedDesignSystem;          // from discoverDesignSystem/loadDesignSystem
  paths: DesignSystemPaths;
  tokens?: TokenTree;              // present → recompute compiledHash + rewrite tokens
  registry?: Registry;             // present → recompute registryHash + rewrite registry
  entry: ChangelogEntry;           // kind + by + data; caller owns the semantics
  nowIso: string;
}
/** Atomically rewrite the given artifact(s) + the manifest: bump generation, rehash, append
 *  changelog. Throws DSManifestError on a half-commit with the recover-or-explain message. */
export function reseal(input: ResealInput): { generation: number; compiledHash: string; registryHash: string };
```

**Callers (3):**
| Caller | Passes | Changelog kind |
|---|---|---|
| `ds-change-token-impl.ts` | `tokens` | `change-token` *(existing — this proves the extraction)* |
| `registry.ts` (`runRegister`) | `registry` | **`register`** *(declared, never emitted)* |
| `figma-reconcile-run.ts` (`--apply`) | `registry` | `register` *(same kind; `by: "ui figma reconcile"`)* |

**`change-token` must be migrated in this PR.** An extraction with one caller is a rename; with
two it is a shared layer. If migrating it proves risky, that is a finding — report, do not skip.

### D2 — `--force` refuses rather than destroys

`ds-import-impl.ts:46` guards only `paths.tokens`. Add: if `paths.registry` exists **and** parses
to a non-empty `components[]`, `--force` alone is **not** sufficient — fail with a new code
`REGISTRY_NOT_EMPTY` naming the count and the opt-in flag `--reset-registry`. With
`--reset-registry`, today's behaviour (wipe + `generation: 1`) is preserved verbatim.

*Rationale:* `onboard.md` §4 actively recommends `--force` for the stale-seal case. Making it
refuse is cheaper than rewriting the doctrine that steers users into it. dana lost 3 components
and 102 changelog entries this way, silently.

### D3 — the naming trio: rename the doctrine, not the field

Canonical: **`tokensUsed`** (the persisted key; `registry-store.ts:242`). Fix the other two:
- `extract.md` step 10 check 2 — *"declare at least one entry under `tokens`"* → `tokensUsed`.
- CLI flag `--tokens` → **keep** (`--tokensUsed` is hostile), but its help text names the field
  it writes.

*Rationale:* the key is on disk in every existing registry; renaming it breaks stores. The
doctrine is text. **Note in the PR that this trio fooled the dogfood reporter AND a reader
holding the full source** — that is why it is worth a commit.

### D4 — do not heal any store. Record the state; every project is re-onboarded later

**Owner, 2026-07-17:** *record the damage now; once design:os is finished, re-init all of these
projects from scratch.* So this PR heals nothing and specifies no reseal-in-place escape.

Record in the PR body: `platform-design-system` is DS_TAMPERED (162 `figma.changes.jsonl`
entries); `VSF-PCP` sits at `generation: 1`, named **`imported-ds`** — the exact default
`onboard.md` §4 STOP-gates against — with an absolute scratchpad path in its sealed `intent`.

Two consequences worth stating, because they turn a chore into the plan:

1. **The re-onboard is Art III at full scale.** When the code road works, re-initing VSF-PCP,
   platform-design-system and the 9 code projects on disk *is* the real-data gate — not a
   sampled one. Phase 4's ≥3-project gate is the rehearsal.
2. **These defects fix themselves at re-init** — the poisoned name, the leaked path, the reset
   generation, the tampered seal. None of them needs a migration. **Do not build one.**

### D5 — `saveRegistry` canonical-stringify: fix here

`registry-store.ts:336` uses `JSON.stringify`, contradicting `ds-manifest.ts:4-7` (*"Every writer
in this codebase must call canonicalStringify — never JSON.stringify directly"*). Harmless today
(`verifyHashes` hashes the **parsed** object, `design-system.ts:169-180`) — but this phase is
where a reseal starts depending on registry bytes. Fix it here; it is two lines and the mandate
already exists.

## Related Code Files

**Create**
- `src/core/ds-reseal.ts` (~90) — D1
- `tests/ds-reseal.test.ts`
- `tests/seal-invariant.test.ts` — **the Art II linter** (see Tests)

**Modify**
- `src/commands/registry.ts` — import + call `reseal` in `runRegister` (`:189` area). **Do not
  grow this file** (319 ln); the diff is ~6 lines.
- `src/commands/figma-reconcile-run.ts` — reseal after `saveRegistry` (`:167`).
- `src/commands/ds-change-token-impl.ts` — migrate `:300-342` to call `reseal`. Net **negative**
  lines.
- `src/commands/ds-import-impl.ts` — D2 (`:46` guard, new `REGISTRY_NOT_EMPTY`), D5 fallout, and
  the doubled-newline bug at `:84-86` (`canonicalStringify` already appends `"\n"`,
  `ds-manifest.ts:74`).
- `src/core/registry-store.ts` — D5 (`:336`).
- `src/core/command-signatures.ts` — `--reset-registry` flag + `REGISTRY_NOT_EMPTY` error code.
- `templates/workflows/extract.md` — D3 (`tokens` → `tokensUsed`).

**Never**: `src/core/design-system.ts` (the verifier is correct — it caught this),
`src/core/ds-manifest.ts` primitives (already right), `knowledge/**`.

## Implementation Steps

1. `ds-reseal.ts` + `tests/ds-reseal.test.ts` (pure-ish; fs via tmpdir).
2. **Migrate `change-token` first.** Green suite = the extraction is faithful. If it is not,
   stop and report — the ceremony has a detail the audit missed.
3. Wire `registry register` (kind `register`, `by: "ui registry register"`).
4. Wire `figma reconcile --apply` (kind `register`, `by: "ui figma reconcile"`).
5. D2, D5, the doubled-newline fix.
6. `tests/seal-invariant.test.ts` — the linter.
7. D3 doc edit.
8. Four gates + `npm test` + `ui knowledge check`.

## Tests — file, name, assertion

### `tests/seal-invariant.test.ts` — **the Art II linter**

- `test_every_sanctioned_write_leaves_the_ds_loadable` → for each of `registry register`,
  `figma reconcile --apply`, `ds change-token`: run it against a sealed fixture, then
  `loadDesignSystem` → **no throw**. *This is the test whose absence let two writers drift.*
- `test_a_new_sealed_artifact_writer_must_reseal` → static: any `src/commands/*.ts` that imports
  `saveRegistry` **or** writes `paths.tokens` must also import from `ds-reseal.js`. Allowlist:
  `ingest-figma-ds.ts` (writes the unsealed bundle — `onboard.md` E4), `ds-init-impl.ts`,
  `ds-import-impl.ts` (birth sites, reseal inline). *Mirrors `tests/autorecord-wiring.test.ts`
  (spec 006 P2) — the precedent for a meta-linter as a vitest.*

### `tests/ds-reseal.test.ts`

- `test_reseal_bumps_generation_and_rehashes_only_what_changed`
- `test_reseal_appends_the_callers_changelog_entry`
- `test_a_half_commit_reports_recover_or_explain_and_does_not_leave_a_silent_stale_seal`
- `test_reseal_is_byte_stable_for_the_same_input` (Art I)

### `tests/cmd-registry.test.ts` (extend)

- `test_register_then_ds_status_exits_zero` → **the one-line repro that has been failing since
  the command shipped.** `ds init` → `registry register` → `ds status` → exit 0.
- `test_register_appends_a_register_changelog_entry` → kind `register`, by `ui registry register`.
- `test_register_refusing_a_bad_token_leaves_the_seal_intact` → `BAD_TOKEN`, DS still loads,
  registry unchanged. *This refusal is what makes host-model-reads safe in Phase 4.*

### `tests/cmd-figma-reconcile.test.ts` (extend)

- `test_reconcile_apply_then_ds_status_exits_zero` → the second writer.

### `tests/cmd-ds-import.test.ts` (extend)

- `test_force_over_a_non_empty_registry_fails_registry_not_empty`
- `test_force_with_reset_registry_wipes_as_before` (the escape hatch still works)
- `test_import_writes_single_trailing_newline` (the doubled-`\n` bug)

## Success Criteria

1. `ds init` → `registry register` → `ds status` exits 0. Generation +1, changelog kind
   `register`. **This sentence has been false since the command shipped.**
2. `figma reconcile --apply` → `ds status` exits 0.
3. `ds change-token` behaviour byte-identical to before (the extraction is faithful).
4. `ds import --force` over a non-empty registry refuses with `REGISTRY_NOT_EMPTY`.
5. `seal-invariant.test.ts` fails when any caller drops its reseal (Art II: emitter + linter,
   same commit).
6. `registry.ts` still < 330 lines; `ds-reseal.ts` < 200 (Art IX). `ds-change-token-impl.ts` net
   shorter.
7. Four gates + `npm test` + `ui knowledge check` green.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **`platform-design-system` is tampered TODAY and this PR does not heal it** | Out of scope by D4 — but **name it in the PR body**. Healing needs either `--force` (destroys its registry) or a reseal-in-place escape nobody has specified. **Owner call.** Do not silently repair someone's store. |
| The extraction changes `change-token`'s bytes | Step 2 migrates it first and the existing suite is the oracle. A diff in output = stop and report, not adapt the test. |
| `figma reconcile` reseal breaks the live-sync loop's cursor semantics | Reseal **after** `saveRegistry`, **before** the cursor advance. Spec 004's `--dry-run` writes nothing and must stay untouched. |
| A wider class exists that the audit missed | The audit enumerated `saveRegistry` callers and `paths.tokens`/`paths.registry` writers, and `seal-invariant.test.ts` makes the class **enforced** rather than surveyed. If a sixth writer appears, the linter fails on it. |
| `--force` refusing breaks `onboard.md` §4's recommended recovery | Intended. §4 recommends the command that destroys the work it recovers. The doc edit is D3's neighbour — if the refusal contradicts a doctrine sentence, **fix the sentence**. |

## Security Considerations

None new. No network, no model, no credentials. The reseal writes only inside the project's
`design/`. D2 **reduces** blast radius: the destructive path now requires an explicit flag.

## Deviations from `plan.md` (report at the gate)

1. **Plan said "patch `registry register`"; the audit says extract for three callers.** That is
   the Art IV question answering itself — the reason `plan.md` ordered the audit first.
2. **`figma reconcile --apply` was not in the plan.** It is the second unsealed writer, found by
   the audit, proven live on `platform-design-system`.
3. **D5 (`saveRegistry` canonical-stringify) was a "record it" bonus; it is now in scope** —
   this phase makes a reseal depend on registry bytes.

## Next Steps

- Phase 2 (the honest router) is independent — it can land in parallel.
- Phase 4's component registration depends on this: `learn.md`'s gate (*"≥1 component registered"*
  **and** *"`ds status` exits 0"*) is unsatisfiable until this lands.
- The `--force`/`onboard.md` §4 tension surfaces the F3 half of R2's root premise. If D2 feels
  like it is fighting the doctrine, that is the premise talking — record it, do not widen scope.
