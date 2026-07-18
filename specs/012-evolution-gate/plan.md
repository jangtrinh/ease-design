# Plan — Spec 012: The evolution gate

**Brainstorm**: `brainstorm.md` (decisions resolved 2026-07-18) · **Domain**: COMPLEX
**Grounded**: dana (dead-loop: 1 event type, 0 insight, no soul, no heartbeat) vs VSF-PCP (alive:
4 types, 4 insights, ratified soul, 5-task heartbeat). The check must call dana DEAD, VSF ALIVE.

## Phase 1 — `design-os evolution` (the test the owner asked for)

A conductor command that reads a project's loop state and reports **ALIVE / DEAD-LOOP** + per-signal
detail. Read-only, deterministic, no model.

### Signals (read from the project's `design/`)
| Signal | Read from | Emit |
|---|---|---|
| ledger diversity | `memory.events.jsonl` — distinct `type` values | count + the type set |
| learning events | ledger — any `insight`/`gap` type | count |
| graph insights | `memory.graph.json` — insights, `seen>1` | total + recurrent |
| soul | `soul.md` — exists · `status: ratified` · has evidence citations | state |
| gaps | ledger `gap` events (+ `design-os librarian collect` count if cheap) | count |
| taste votes | `votes.jsonl` if present | count |
| heartbeat | `heartbeat.json` (wired?) + `heartbeat-state.json` lastRunAt (firing?) | tasks + recency |
| DS role gaps | tokens `$extensions.role` coverage vs the gap list (spec 011) | gaps |
| registry growth | `component-registry.json` count + ledger `component_registered` | count |

### The verdict (grounded rule, §6.3)
- **DEAD-LOOP**: ledger has events but ZERO learning signal — only mechanical types, no graph
  insight, no gap, no ratified soul, no recent heartbeat. (dana.)
- **NO-LOOP**: no `memory.events.jsonl` at all. (platform-DS, sodeal, traicaybentre — never ran.)
- **ALIVE**: any learning signal present — an insight, a gap, a ratified soul, or a heartbeat that
  fired recently. (VSF.)
- Verdict is a rollup; the report ALWAYS lists every signal's state so it's actionable (Art VIII).
  Exit 0 always (a health report, not a gate that fails a build — it INFORMS).

### Where / how
- `design-os` conductor (Python/Typer), a new `evolution` command. It composes: kernel reads
  (`ui memory compile`/the ledger, soul, tokens) + heartbeat state (design-os's own). Re-emit
  kernel envelopes verbatim where used (Art I.3).
- `--json` machine output + a human summary. `--dir <project>` like the other design-os commands.

### Tests (Art II + Art III — real data, paired)
- `test_dana_shape_is_dead_loop` — a fixture with only `token_change` events, no graph, no soul →
  verdict DEAD-LOOP, and the report names "no insights, no soul, heartbeat not wired."
- `test_vsf_shape_is_alive` — a fixture with an `insight` event + ratified soul + heartbeat →
  ALIVE.
- `test_no_ledger_is_no_loop` — no `memory.events.jsonl` → NO-LOOP.
- **LIVE (Art III)**: run on dana-desktop (real, → DEAD-LOOP) and VSF-PCP (real, → ALIVE). Paste
  both verdicts in the report. If dana isn't DEAD or VSF isn't ALIVE, that's a finding — report it.

## Phase 2 — wire the fuel line at DS-store creation (`ds init` AND `ds import`)

**Plan correction (measured 2026-07-18): the seam is `ds init`/`ds import`, NOT `ui init`.** `ui init`
writes only the runtime adapter tree; it never creates `design/`. The fuel line lives in `design/`,
which is born at `ds init`/`ds import`. Measured gaps:
- `ds init` scaffolds a soul (`writeSoulScaffold`, `ds-init-impl.ts:250`) — but **`ds import` does
  NOT**. dana was onboarded via `ds import` (the code road) → no soul. **That is why dana has no
  soul.md.**
- **Nothing writes `heartbeat.json`** — VSF's was hand-authored by the P5 gate. No project gets a
  heartbeat at creation.

The fix, at BOTH `ds init` and `ds import`:
1. **Soul scaffold** — `ds import` gains `writeSoulScaffold` (draft, `status: draft`), same as
   `ds init` already has. Closes the dana-no-soul gap. (Only when `soul.md` absent — `/ui:learn`'s
   evidence-draft must not be clobbered.)
2. **Default `heartbeat.json`** — both write it if absent: the Figma-independent tasks `ds-a11y`
   (1d), `specimen` (1d), `harvest` (12h), `reflect` (24h). **NOT `figma-audit`** (needs a figma
   file — omit from the default; add only when one is configured).
3. **`harvest-inbox/`** — create the dir (where harvest writes with no model adapter).
- **Never** fabricate soul content or insights. This makes the loop AVAILABLE; use fills it (the
  mindset: scaffold, don't fake).
- A static template file (heartbeat.json, soul scaffold) is deterministic — the kernel writing it
  is fine (like the existing soul scaffold), and does not couple the kernel to the conductor's
  runtime; it only seeds a config the conductor later reads.
- Test: after `ds import`, `design-os evolution` reports the loop WIRED (heartbeat present, soul
  scaffolded) though not yet FIRED (no events) — a distinct state from DEAD-LOOP.

## Phase 3 (Should) — the dynamic gate — **BUILT 2026-07-18** (`phase-03-dynamic-gate.md`)
The uncovered half was TRANSITION, not a "real slice": every existing test reads a static
store; none walks one store as work accrues. The gate does — WIRED → (mechanical work) WIRED
[the anti-lie] → (heartbeat fired, no model) DEAD-LOOP → (an insight lands) ALIVE — driving the
real `design-os evolution` CLI at each rung. Deterministic/hermetic (no model needed); the
harvest→insight *producer* chain stays covered by test_command_harvest/heartbeat_runner_harvest.
Measured real-data run (Art III): real dana import → WIRED; real heartbeat fire with no model →
DEAD-LOOP (a11y/specimen run `ok` but record nothing; harvest/reflect skip). The sobering
finding it encodes: **wiring alone doesn't evolve a loop; reaching ALIVE needs real work AND a
model adapter.**

## Risks
| Risk | Mitigation |
|---|---|
| The dead/alive rule is set from 2 projects | It's a LEARNING-SIGNAL rule, not a fragile count — grounded in the qualitative dana-vs-VSF difference, not a threshold. Re-examine when more projects have loops. |
| The check reads heartbeat state the kernel can't see | That's exactly why it's a `design-os` conductor command (§6.1). |
| init wiring fires the heartbeat unexpectedly | It doesn't — wiring writes config; firing needs `design-os heartbeat` run by the host (§6.2). |
| A green check on a dead loop (the lie spec 006 killed) | No-Go 1: the check reports the REAL state; dana MUST read DEAD-LOOP. The paired live test enforces it. |
