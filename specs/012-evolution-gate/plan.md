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

## Phase 2 — `ui init` wires the fuel line (so a fresh inject can evolve)

- Write `design/heartbeat.json` — VSF's proven 5-task shape (`ds-a11y` 1d, `specimen` 1d,
  `harvest` 12h, `reflect` 24h; `figma-audit` only if a figma file is known). By default (§6.2).
- Scaffold `design/soul.md` (draft, `status: draft` — owner ratifies; never fabricate a stance).
  If `/ui:learn` already drafts it from evidence, don't duplicate — wire the scaffold only when
  absent.
- Create `design/harvest-inbox/` (where harvest writes with no model adapter).
- **Never** write fake insights/soul content. init makes the loop AVAILABLE; use fills it.
- Test: after `ui init`, `design-os evolution` on the fresh project reports the loop is WIRED
  (heartbeat present) though not yet FIRED (no events) — distinct from dead-loop.

## Phase 3 (Should, follow-up) — the dynamic gate
inject → run a real slice (lints/audit) → `design-os evolution` shows the ledger diversified.
Needs the heartbeat/harvest to run; E2E, its own follow-up.

## Risks
| Risk | Mitigation |
|---|---|
| The dead/alive rule is set from 2 projects | It's a LEARNING-SIGNAL rule, not a fragile count — grounded in the qualitative dana-vs-VSF difference, not a threshold. Re-examine when more projects have loops. |
| The check reads heartbeat state the kernel can't see | That's exactly why it's a `design-os` conductor command (§6.1). |
| init wiring fires the heartbeat unexpectedly | It doesn't — wiring writes config; firing needs `design-os heartbeat` run by the host (§6.2). |
| A green check on a dead loop (the lie spec 006 killed) | No-Go 1: the check reports the REAL state; dana MUST read DEAD-LOOP. The paired live test enforces it. |
