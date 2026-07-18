# Phase 3 — the dynamic evolution gate (spec 012)

**Status**: built 2026-07-18 · **Domain**: COMPLEX (deferred "Should" from the plan, now cut)
**Grounded**: every rung below was MEASURED live before a line of test was written
(`scratchpad/p3-ladder.sh` on the committed fixture) — not a hypothesis.

## What P1/P2 left uncovered (the gap this fills)

P1's `test_command_evolution.py` drives the real `design-os evolution` CLI on four **static**
shapes (NO-LOOP / DEAD-LOOP / WIRED / ALIVE). Every one is a snapshot. But "evolution" means
**change over time** — the owner's question was *does the agent evolve when injected*, not
*what verdict does a frozen store read*. No test walks a **single store** as work accrues.

The dynamic gate closes that: one store, evolved rung by rung, the real `evolution` command
read at each step, asserting both the transition AND the **anti-lie** (mechanical work must
never read ALIVE).

## The measured ladder (the assertion table)

| Rung | Mutation to the store | `evolution` verdict | Why |
|---|---|---|---|
| **R1** | fresh synthetic fixture (`ds init`, wired, empty ledger) | **WIRED** | loop configured, nothing learned yet |
| **R2** | append `token_change` + `lint_run` + `component_registered` | **WIRED** | **ANTI-LIE**: mechanical work is not learning; verdict must NOT jump to ALIVE |
| **R3** | write `heartbeat-state.json` with a fired history | **DEAD-LOOP** | the honest way-station — the loop fired but produced no learning signal (measured live: firing the default heartbeat with no model adapter lands exactly here) |
| **R4** | append one `insight` event (with `refs`) | **ALIVE** | a learning signal is present |

## The fixture (self-owned — NEVER client data)

`design-os/tests/fixtures/evolution-dynamic/design/` — a real `ds init --persona
data-dense-observatory` output (160 tokens, 27-component kit, `soul.md` draft, `heartbeat.json`
4-task, `harvest-inbox/`, empty ledger). 100% design:os-generated: **no dana/VSF/client tokens
committed to the OSS repo** (dana is a freelance client — its DS is its IP). Reads WIRED.

## Seam & method

- **Only** `design-os evolution` (real CLI via `CliRunner`) is exercised per rung. The store is
  evolved between rungs by writing the real event byte-shapes (`memory-events.ts`'s closed
  vocabulary) and the real `heartbeat-state.json` shape (`evolution_signals.read_heartbeat_signal`
  reads `tasks.<id>.history[0].at`). Deterministic, hermetic — no `ui`, no node, no model.
- **Not re-proven here (DRY)**: the *producer* chain that makes R4's insight in production —
  `design-os harvest` + a model adapter + `ui memory record` — is already covered end-to-end by
  `test_command_harvest.py` and `test_heartbeat_runner_harvest.py`. The gate cites them; it tests
  the *verdict's dynamic response*, the uncovered half.
- Assertions read an **independent source of truth** (the documented verdict rule + expected
  ledger type set), never recompute the way `compute_verdict` does → not tautological.

## Art III — the real-data run (not a fixture)

The fixture validates the *mechanism*; the contract needs one real run. Done and pasted:
`ds import` of real dana-desktop tokens → **WIRED**; real `design-os heartbeat --force` with no
model adapter → tasks a11y/specimen `ok` but write zero ledger events, harvest/reflect skip
(`no-new-reports`/`no-new-events`) → **DEAD-LOOP**. This is the sobering measured finding the
gate encodes: **wiring alone doesn't evolve a loop, and firing without a model adapter doesn't
either — reaching ALIVE needs real work AND a model.**

## Files

- **create** `design-os/tests/fixtures/evolution-dynamic/design/**` — the committed wired store.
- **create** `design-os/tests/test_evolution_dynamic_gate.py` (<200) — the ladder test.
- No production code changes. P3 IS the test (Art II: the standard's check, here the loop's).

## Acceptance

- The four rungs assert exactly the verdicts above on the real CLI; R2 is labelled the anti-lie.
- `uv run pytest -q` green; the existing 255 pass unchanged.
- An open observation logged for the owner (not fixed mid-task): the heartbeat's `a11y`/`specimen`
  tasks run `ok` but write no ledger event — likely by design (heartbeat-state is their memory,
  not the event ledger), but it means the wired heartbeat can never on its own move a project off
  DEAD-LOOP. Flag as a question, not a patch.
