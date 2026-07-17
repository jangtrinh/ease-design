# Plan — Spec 009: The code road (E2)

**Spec**: `spec.md` · **Inputs**: `brainstorm.md`, `usecases.md` (both approved 2026-07-17)
Four phases, four PRs, ordered by **what is broken now** — not by the road's own narrative.

## Phase order — and why it is not the obvious one

The road's story runs scan → vocabulary → components. The delivery order does not, because
**Phase 1 is not about this road at all**: `registry register` never reseals, and
`generate.md` Step 7 calls it. `/ui:generate` — the flagship verb — silently tampers the store
it just wrote into, on `main`, today. That is a live defect with five callers; it ships first
and alone, and it is reviewable without a single line of code-road work.

| Phase | Title | Fixes | Depends |
|---|---|---|---|
| 1 | The living seal | R2 (F1) · F3 · R3 naming | — |
| 2 | The honest router | R1 (F10) | — |
| 3 | The vocabulary | CSS→DTCG+modes · F2 · F4 · F6 · R4 | 1 (seal), 2 (router) |
| 4 | The road + the gate | learn/extract doctrine · registration · Art III gate | 1, 2, 3 |

Phases 1 and 2 are independent of each other and of the road; either can land first.

## Phase 1 — The living seal

**Art IV first, patch second.** `registryHash` is written only by `ds-init-impl.ts:200` and
`ds-import-impl.ts:80` — birth sites. Before touching `registry.ts`, **enumerate every writer
of a sealed artifact** and ask which others skip the reseal. If the answer is "N others", the
shared helper is the deliverable and `registry register` is merely its first caller.

- Extract the reseal ceremony that `ds-change-token-impl.ts:300-315` performs inline
  (`canonicalHash` → `appendChangelog` → tmp-write → rename, `ds-manifest.ts:73,81,261,300`)
  into one shared helper. `change-token` becomes its second caller — proving the extraction.
- `registry register` emits `kind: "register"` — **already declared** at `ds-manifest.ts:16-19`,
  **already admitted** at `:97`, **never emitted**. Nobody wired the last connector.
- `registry.ts` is 319 lines (Art IX). The helper does not live there.
- `ds import --force`: preserve the registry, or refuse with an explicit opt-in. Today
  `ds-import-impl.ts:74` calls `createEmptyRegistry()` unconditionally — dana lost 3 components
  and 102 changelog entries to it, and `onboard.md` §4 **recommends** the command.
- R3: one name per concept. The record key is `tokensUsed`; `extract.md` step 10 says `tokens`;
  the flag is `--tokens`. Pick one, fix the other two, and note that this trio fooled the field
  reporter *and* a reader holding the source.
- **Bonus check**: `saveRegistry` (`registry-store.ts:336`) uses `JSON.stringify`, not
  `canonicalStringify` — contradicting the mandate at `ds-manifest.ts:4-7`. Harmless today
  (`verifyHashes` hashes the parsed object); latent. Fix while here or record it.

## Phase 2 — The honest router

`project-scan.ts` — `MAX_DEPTH = 6`, `MAX_ENTRIES = 4000` (`:44-45`); `:113` returns on
exhaustion with **no signal**; `:108` sorts alphabetically; the walk is depth-first (`:132`).

- **BFS.** UI directories are shallow; 415-file service subtrees are deep. Same budget, spent
  on the cheap informative layer first. `SKIP_DIRS` (`:40-42`) is already correct — do not
  touch it.
- **`truncated` + `visited`** as **additive** envelope fields. Art VIII: today `ok: true` with
  `cssFiles: 0` asserts a completeness the walk never achieved.
- Keep the cap. `truncated` is the honesty surface, not a tuning artefact — it stays in the
  contract even if the cap later moves.
- Live regression to pin: `ui scan --cwd <dana>` must report `src/desktop-ui` and
  `dana-tokens.css`. Today: `cssFiles: 0, componentDirs: 0, truncated: (absent)`.

## Phase 3 — The vocabulary

- **Reuse before writing** (`/es-lazy`): `ui designmd extract-tokens --css` already harvests
  custom properties — the dogfood measured 122 colors / 330 custom props out of
  `dana-tokens.css`. The ingest may be mostly glue, not a new parser. **Check this first.**
- F4: `--css` is single-value/last-wins because `cli-args.ts:11` types flags as a scalar map.
  The comma form (`--css a,b`) works and is undocumented; the repeatable form the help text
  advertises (`designmd.ts:21`) silently drops all but the last. Accumulate or hard-error.
- F2: `ds import` skips alias values (`token-import.ts:45`) — dropping exactly the semantic tier
  `token-taxonomy.md:110` mandates. `ALIAS_RE` already exists at `token-model.ts:62` and
  `change-token` already accepts aliases (`ds-change-token-impl.ts:243-245`).
- F6: `token-import.ts:81` passes source group names through verbatim → `fontSize`/`zIndex`,
  which `TOKEN_PATTERN` (`registry-store.ts:74`) forbids. `ds init` writes kebab-case
  (`persona-expand.ts:613`) — which is why the collision only bites imported systems. One
  casing convention, both sides.
- R4 (Art II): the `mode.<name>` convention lives only in `figma-ds-tokens.ts:13-16`, marked
  *"kept local to avoid a cycle"*; `token-model.ts` has no mode concept. Phase 3 makes the code
  road its **second emitter**. One shared definition + one linter, same commit — or it drifts.
- Themes → modes: `[data-theme="x"]`, `.dark`, `prefers-color-scheme`. All three appear across
  the surveyed corpus (`data-theme` 3/3).
- **Record, do not fix**: dana's 4 parallel hardcoded gray ramps violate `token-taxonomy.md:121`.
  Phase 3 ingests and **records the finding**. The detector is a later spec.

## Phase 4 — The road + the gate

- `learn.md`: the code branch is one line into an HTML workflow. Give it a real route.
- `extract.md`: Inputs say *"A single HTML artifact"* — either widen it or stop routing code
  into it. **This one sentence is the road's actual blocker**; everything else is plumbing.
- Registration: the host model reads the 3–5 files `learn.md` §3a already mandates and supplies
  `markup` (HTML — the design, per the locked decision), `tokensUsed`, `states` (observed only,
  §3b). The kernel validates; `BAD_TOKEN` is what makes model-reads safe without a parser.
- **Undecided, must be stated in the phase file, not discovered** (Art V): dana's Button is 8
  variants × 3 sizes × 3 radii. `name` is `Category/Variant`; `variants` is an optional array.
  Which axis becomes the record?
- **Art III gate** on ≥3 of the 9 code projects, chosen for spread: dana-desktop
  (Electron/TW4, 6 css), traicaybentre (999 components, 340 css), hvs (1162 css-vars). Report a
  before/after table per project, plus **one thing the road got wrong** — or "none", but look.
- EaseUI is the adversarial case: no root `package.json`, 62 nested, two legitimate UI roots
  (`app/src/components`, `frontpage/app/src/components`). Not required for the gate; run it and
  report what happens.

## Open questions (must resolve before the phase they block)

1. **EaseUI's genuine tie** — two real UI roots, `--ui-root` ruled out. Largest wins, or the one
   question `learn.md` §2 already budgets for? *Blocks Phase 2's completion criteria.*
2. **Variant axes** (above). *Blocks Phase 4.*
3. **Does any other writer of a sealed artifact skip the reseal?** Phase 1's Art IV audit
   answers it; the answer decides whether Phase 1 is a patch or an extraction. *Blocks Phase 1.*

## Risks

| Risk | Mitigation |
|---|---|
| Phase 1 turns out to be a wide class (N unsealed writers) and swells | That is the Art IV answer arriving, not scope creep. Split: the helper + `register` in PR 1, the other callers in PR 1b. |
| The vocabulary ingest is written dana-shaped | Every rung ships with its count over the corpus (brainstorm No-Go 5). A rung at 0/9 does not ship. This session already killed two dana-shaped designs; the survey is the guard. |
| Host-model-read markup is non-deterministic across runs | Accepted and bounded: `BAD_TOKEN` refuses invented tokens; `learn.md` §3c mandates SOURCE-grade + an "unverified" list; 0/3 CVA means determinism is unpurchasable today. Revisit when the corpus shows a standard worth parsing. |
| The gate runs only where it passes | ≥3 projects chosen for **spread**, not for comfort. A failure is a finding and is reported (Art VIII). |
| `/ui:generate` regressions from the reseal | It is already broken — it just does not check. Phase 1 adds the check it never had; pin it with a test that registers and then loads. |
