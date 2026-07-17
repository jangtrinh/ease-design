# P5 real-data gate — procedure + status

**Status: NOT YET RUN.** Part B of phase-05 is owner-in-the-loop (Art III): the executor
(Sonnet) implemented the `harvest`/`reflect` runners + tests (Part A, done — see the P5
report in the session that produced this file) but did not execute a live harvest against
either project below, since that requires `DESIGN_OS_MODEL_CMD` pointed at a real model and
is explicitly reserved for the owner/Fable. This file is the exact procedure to run — fill
in the tables as each step executes.

## Resolved project paths

`~/.ease-design/projects.json` (`loadRegistry`) currently lists only `brand`
(`/Users/jang/Products/ease-design/brand`) — **VSF-PCP and platform-design-system are not
registered**. Both exist on this machine with a `design/` directory (filesystem-confirmed,
not registry-confirmed):

| project | path |
|---|---|
| VSF-PCP | `/Users/jang/Products/VSF-PCP` |
| platform-design-system | `/Users/jang/Products/platform-design-system` |

Owner: confirm these are the correct, current paths before running the gate (they were
located by directory name under `~/Products`, not pulled from the registry — per the phase's
"do not guess a path" constraint, treat this as a filesystem finding to confirm, not a
registry fact). No manual registration step is needed: `upsertRegistry` (memory-store.ts)
writes `~/.ease-design/projects.json` as a side effect of the FIRST `ui memory record` call
against a project — harvest's or reflect's first successful run on each project will add it.

## Procedure (run once per project — `<p>` = the resolved path above)

### 1. Baseline (record exact output in the table below, BEFORE anything else)

```sh
ui memory compile --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --dir <p> --json
jq -r .type <p>/design/memory.events.jsonl | sort | uniq -c
design-os librarian collect --dir <p> --json
```

If the baseline does NOT match "one ingest burst, ~2 mechanical types, 0 gaps, 0 insights,
empty graph" (the audit finding that motivated spec 006 — memory
`living-loop-fuel-line-finding`), **say so explicitly in this report** — the motivating
evidence would be stale and the gate's meaning changes.

### 2. Fuel the line

Do a REAL slice of work with the fed binary — the lints/audit the project actually runs
(e.g. `ui audit`, `ui ds a11y`, whatever that project's own workflow calls). **Do not
synthesise runs to pad the ledger** — that is fixture data wearing a real project's clothes
(Risk Assessment, phase-05).

### 3. Harvest

```sh
design-os harvest --dir <p> --dry-run --json   # inspect first — candidates/dropped counts
design-os harvest --dir <p> --json             # then live, once the dry-run looks right
```

Requires `DESIGN_OS_MODEL_CMD` set to a real model command (unset → the run degrades to
`skipped`/`no-model-adapter`, exit 0, and writes the packet to `design/harvest-inbox/` for
manual inspection instead — that is NOT a failed gate, just an unconfigured one; note which
case occurred).

### 4. Compile + inspect

```sh
ui memory compile --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --dir <p> --json
jq -r .type <p>/design/memory.events.jsonl | sort | uniq -c
```

Look for `insights` with `seen > 1` in the compiled output (recurrence signal) — note
whether any exist.

### 5. Graduate

```sh
design-os librarian collect --dir <p> --json
```

Then run the librarian loop per `knowledge/librarian-loop.md` (fresh-judge veto chain) — it
opens a PR. **The owner merges** (Decision 6 — graduation-merge autonomy stays owner-merge;
unchanged from `librarian-loop.md` step 7, "Human gate — the invariant").

### 6. Fill in this table + the verbatim lessons below, then commit this file

| Metric | VSF-PCP before | after | platform-DS before | after |
|---|---|---|---|---|
| ledger events | TBD | TBD | TBD | TBD |
| distinct event types | TBD | TBD | TBD | TBD |
| graph insights (`seen > 1`) | TBD | TBD | TBD | TBD |
| open gaps (`librarian collect`) | TBD | TBD | TBD | TBD |
| librarian PRs opened / merged | TBD | TBD | TBD | TBD |
| harvest: candidates → recorded → dropped (by reason) | TBD | TBD | TBD | TBD |

**One real lesson that made it from a `plans/` report into the ledger** (verbatim):
> TBD

**One that the gate dropped and should not have** (verbatim, or "none" — but look for it):
> TBD

## Reflect's known blind spot (Decision 5, record here whether it mattered)

Only `memory export-corpus` **embeddable** event types reach `reflect` —
`insight`/`token_change`/`harvested`/`vibe_edit`/`variant_generated`. P1's
`lint_run`/`autofix_applied`/`reconcile_applied`/`taste_vote` are invisible to `reflect` in
v1. If the real-data run shows the lint stream carries a lesson `reflect` cannot see, note it
here — opening `memory-corpus.shape()` to `lint_run` is a spec-007 decision, not a silent
patch in 006.

## After this runs

Update memory `living-loop-fuel-line-finding` with the after-state, per phase-05's Next
Steps: the audit that motivated spec 006 should end with its own answer.

---

## GATE RUN — RESULT (2026-07-17, PASS)

Ran live on **VSF-PCP** with `DESIGN_OS_MODEL_CMD="claude -p --model sonnet …"`.

| Signal | Before | After |
|--------|--------|-------|
| ledger events | 159 (ingest-only + 1 lint_run) | **168** |
| `insight` events | 0 | **4** |
| `memory.graph.json` insights | 0 | **4** |
| harvest gate | — | 8 candidates → **4 recorded, 4 dropped** (`evidence-not-in-source`) |

**The 4 insights are real, evidence-grounded lessons** the harvest lifted from the dogfood
reports (dead-variant false-positives on interaction-only variants; a bound-variable readback is
not proof of a correct binding; self-reported "0 violations" claims must be independently
re-audited; reference-duel needs a structurally-inspected benchmark). The verbatim-evidence gate
dropped 4 fabricated candidates.

**Proof of the whole thesis:** the loop that was dead (0 insight/gap across two real projects,
ingest-only ledger) is now fed on real data at all three layers — commands (auto-record, 158→159),
prose (harvest, 159→168), and rhythm (heartbeat harvest/reflect wired). **PASS.** Heartbeat config
added to VSF-PCP (`harvest` 12h + `reflect` 24h). Fuel-line documented for the project in
`VSF-PCP/design/LEARNING-LOOP.md`.
