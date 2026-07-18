# Brainstorm — Spec 012: The evolution gate (does the agent evolve when injected?)

**Stage**: brainstorm · **Sizing**: L · **Date**: 2026-07-18 · **Owner-directed**
**Roots**: memory `living-loop-fuel-line-finding` (the loop was dead across 2 real projects);
spec 006 (built the fuel line); the mindset (`respect-their-ds-mindset` — help their DS grow).

## 0. The measured problem (2026-07-18, real projects — not a hypothesis)

The owner asked: *is there a test that the agent EVOLVES when injected into a real project?* The
answer, measured: **no test exists, and the agent does NOT evolve on injected projects.**

| project | ledger event types | graph insights | soul | heartbeat wired |
|---|---|---|---|---|
| **dana-desktop** (dogfooded all session) | **1** (token_change) | **0** (no graph) | **none** | **no** |
| VSF-PCP | 4 (harvested/insight/component/lint) | 4 | ratified | yes (5 tasks) |
| platform-DS · traicaybentre · sodeal | **no ledger at all** | — | — | no |

**Evolution happens on exactly ONE project — VSF-PCP — where spec 006's P5 gate wired the loop by
HAND.** Nowhere else. dana got 276 events from real work this session and learned **nothing**: no
insight, no soul, no graph. The agent "lives in the WORK but not in the LOOP" — spec 006's own
words, still true after spec 006 shipped.

**Root cause, measured**: `ui init` writes only the manifest + adapter tree. It does NOT wire the
fuel line — no heartbeat, no soul, no harvest-inbox. So an injected project has the TOOLS but not
the LOOP. And even the auto-record that does fire (token_change on dana) produces no learning
without harvest/reflect/soul running. **0 tests verify any of this.**

## 1. Press release

**DESIGN:OS proves its agents grow.**

Inject DESIGN:OS into a real project and, from the first real slice of work, its design agent
starts to evolve: the memory ledger diversifies beyond mechanical bookkeeping, insights distil and
strengthen on recurrence, a soul forms from the project's own evidence, and knowledge gaps queue
for graduation. And you can SEE it: one command reports whether a project's learning loop is alive
or dead — and exactly which dimension is stalled. The loop is no longer a claim; it is a gauge you
can read on any project, any time.

## 2. Two halves (owner-approved scope)

### A. Wire the loop at inject-time (`ui init`)
So evolution CAN start. Grounded in VSF-PCP's proven, running setup:
- **heartbeat.json** — the 5-task rhythm VSF runs: `ds-a11y` (1d), `specimen` (1d), `harvest`
  (12h), `reflect` (24h), + optional `figma-audit`. This is what turns the loop with no human.
- **soul scaffold** — a `soul.md` draft (or the `/ui:learn` evidence-draft when onboarding).
- **harvest-inbox** — the dir harvest writes to when no model adapter is configured.
- Auto-record already fires (spec 006 P1) — no change; it just needs the rhythm to have things to
  record.

### B. The evolution health-check (the repeatable TEST)
`design-os evolution` (or `ui memory evolution`) — reads a project's loop state and reports
**ALIVE vs DEAD-LOOP**, with the specific stalled dimension. Runs on dana RIGHT NOW → reports
dead-loop (1 event type, 0 insights, no soul, no heartbeat). The gauge the owner asked for.

## 3. What "evolution" measures — ALL signals (owner: "anything you can think of")

Grounded in the codebase's actual evolution surfaces:

| # | Signal | Source | dead ↔ alive (dana ↔ VSF) |
|---|---|---|---|
| 1 | **Ledger diversity** — distinct event types | `memory.events.jsonl` | 1 ↔ 4 (ceiling is 8: lint_run, autofix_applied, reconcile_applied, taste_vote, token_change, harvested, insight, gap, component_registered) |
| 2 | **Graph insights** — count, and `seen>1` (recurrence) | `memory.graph.json` | 0 ↔ 4. seen>1 = a lesson HELD across harvests, not just written |
| 3 | **Soul** — exists · ratified · evidence-cited clauses | `soul.md` | none ↔ ratified |
| 4 | **Gap events → graduation** | ledger `gap` events + `librarian collect` | 0 ↔ ? (the knowledge fuel line) |
| 5 | **Taste votes** | `votes.jsonl` | 0 ↔ ? (living-loop finding: 0 votes everywhere) |
| 6 | **Heartbeat wired + firing** | `heartbeat.json` + `heartbeat-state.json` lastRunAt | no ↔ 5 tasks |
| 7 | **DS growth** (spec 011) — role gaps closing, change-token cadence | tokens `$extensions.role` gaps + token_change events | — |
| 8 | **Registry growth** — components registered over time | `component-registry.json` + `component_registered` events | dana 0 ↔ VSF 155 |

The verdict is a rollup: **ALIVE** = ledger diverse (≥N types) AND (insights present OR heartbeat
firing) AND soul present. **DEAD-LOOP** = one mechanical type, no insights, no soul — the dana
shape. The report NAMES each dead dimension so it's actionable (Art VIII).

## 4. MoSCoW

| Priority | Item | Rationale |
|---|---|---|
| **Must** | The evolution health-check command — reads all 8 signals, verdict ALIVE/DEAD-LOOP, names stalled dimensions | The test the owner asked for; runs on any project now |
| **Must** | `ui init` wires the fuel line (heartbeat + soul scaffold + harvest-inbox) | Without it, evolution never starts; the test would fail on every fresh inject |
| **Must** | The health-check runs in tests on BOTH a dead fixture (dana-shape) and an alive one (VSF-shape) — the paired assertion | Art II: the standard ships its check; Art III: real data |
| **Should** | Dynamic gate: inject → do a real slice → assert the ledger/graph GREW | The E2E proof (spec 006 P5 shape), repeatable; needs a model for harvest |
| **Could** | `design-os doctor` surfaces the evolution verdict inline | Makes it visible in the normal health flow |
| **Won't (this spec)** | Changing what auto-record fires on, or the harvest gate | Spec 006 owns those; this wires + measures, doesn't rebuild |

## 5. Appetite & No-Gos

**Appetite: the health-check + the init-wiring + the paired test.** That is "the agent has a loop,
and we can prove whether it's turning." The dynamic E2E gate is a Should (it needs a model run).

### No-Gos
1. **No faking evolution.** The check reports the REAL state; on dana it says DEAD-LOOP. Honesty
   floor — a green check on a dead loop is the exact lie spec 006 was built to end.
2. **No auto-injecting soul content or insights.** init SCAFFOLDS a soul (draft, owner ratifies);
   it never writes a fake stance. Same mindset as spec 011's gaps: surface, don't fabricate.
3. **No new event types / no touching the harvest gate.** Spec 006's contract is fixed; this
   composes it.
4. **No threshold without a count.** "≥N event types = alive" — N comes from the corpus
   (dana=1 dead, VSF=4 alive), not a guess. The rule that paid off all session.

## 6. Decisions — resolved with grounded leans (owner may redirect)

1. **Placement: `design-os evolution`** (conductor). It must read the heartbeat state (design-os's
   own), and it is a composed health verdict — the conductor's job. The kernel can't see the
   heartbeat.
2. **`ui init` wires the heartbeat by DEFAULT** — every inject gets a live loop available. Safe
   because the heartbeat only FIRES when the host runs `design-os heartbeat` (cron/manual); wiring
   it just makes the loop ready. (Auto-record already fires per spec 006; no change.)
3. **Dead/alive is a LEARNING-SIGNAL rule, not a type count** (2 data points can't set a count
   honestly). **DEAD-LOOP** = the ledger has events but ZERO learning signal — only mechanical
   types (token_change/lint_run/autofix/reconcile/taste_vote/component_registered), no graph
   insight, no gap event, no ratified soul, no firing heartbeat (the dana shape). **ALIVE** = any
   learning signal present (graph insight, OR gap event, OR ratified soul, OR heartbeat with a
   recent lastRunAt). The report always names every dimension's state — the verdict is a rollup,
   the detail is per-signal (Art VIII).

## 7. Phases

- **Phase 1 — the evolution check** (`design-os evolution`): read all 8 signals, emit the
  ALIVE/DEAD-LOOP verdict + per-dimension detail. The paired test: DEAD on dana's real ledger,
  ALIVE on VSF's. **This is the test the owner asked for** — runnable on any project today.
- **Phase 2 — `ui init` wires the fuel line**: heartbeat.json (VSF's proven 5-task shape), soul
  scaffold, harvest-inbox. So a fresh inject can evolve — making Phase 1 pass on new projects.
- **Phase 3 (Should) — the dynamic gate**: inject → real slice → assert the ledger/graph grew.
  The E2E proof; needs a model for harvest. Its own follow-up.
