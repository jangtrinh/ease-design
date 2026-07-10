# curator — the two-axis quality gate every design must pass

The curator is the SEE-step evaluation for a design job (`workflow-experience.md` lifecycle). A design is not done
when it looks good — it is done when it passes **both** axes. The curator also seeds the learning loop: each verdict
becomes a durable `insight` (Track-9 REFLECT), so what the curator learns on one job grounds the next.

## Axis 1 — TASTE (does it read as senior-quality?)
Unchanged: run the critique gate — `templates/workflows/critique.md` scoring the `taste-rubric.md` 7 axes
(Layout, Typography, Spacing, Motion, Iconography, Depth/Surface, Consistency). Ship bar ≥7 per axis; for
ship-grade briefs, the Excellence tier (adversarial judge + reference duel). Correctness is a gate, not a score
(validate-layout / taste-lint clean first). This axis catches "ugly / off-system / inconsistent."

## Axis 2 — GOAL / SPEC (does it do the job it was built for?)  ← the added axis
A beautiful screen that misses the story is a FAIL. Check three things:
1. **Acceptance-criteria coverage (deterministic).** Run `ui critique-coverage <spec.json> <manifest.json>`:
   - `spec.json` = the brief's `{ acceptanceCriteria:[{id,text}], successMetrics?:[...] }`.
   - `manifest.json` = the produced design's `{ screens:[{ name, coversCriteria:[ids], states:[...] }] }`.
   - It reports `uncovered[]` + `coveragePct` and exits 1 if any criterion is uncovered. **Zero-token, zero-LLM.**
   Every acceptance criterion MUST map to a covering screen/state — no silent gaps. Uncovered = fix before ship.
2. **Goal plausibility (judgment).** Does the design plausibly move the INTENT's success metric? Judge against
   `ux-psychology.md` (the laws the brief triggers) — e.g. an activation flow must minimize per-step friction; a
   pricing page's persuasion must be **honest** (no dark patterns / fake scarcity — ux-psychology's ethical
   persuasion rules are a HARD gate, not a nicety).
3. **Accessibility gate (deterministic).** WCAG contrast (`ui color contrast`), focus order / keyboard reachability,
   ARIA-able structure. A contrast fail is a fail, not a nit.

## Adversarial pass (excellence, reused from taste-rubric §Excellence)
A FRESH judge context (never the maker grading its own work — a subagent where the runtime has them) tries to
**REFUTE** "this satisfies the goal + acceptance criteria." Default to refuted if uncertain. Only what survives
refutation counts as passing the goal axis. This is what stops plausible-but-wrong "looks done" verdicts.

## The verdict + iterate loop
Emit an HONEST verdict — never "looks great" by default:
- Taste: per-axis score + the weakest axis.
- Goal: coverage % + `uncovered[]` + the goal-plausibility judgment + what the refuter found.
Then **iterate the single worst finding** (a failing axis OR an uncovered criterion), re-SEE, within the capped
rounds (≤5, cost contract). Stop when both axes pass or the cap is hit (then STOP honestly and report the gap).

## Feeds the learning loop (Track 9)
Every curator verdict is a learning signal: extract the durable lesson (Reflexion — "what was LEARNED, not what
was said": e.g. *"dense tables need a sticky header + zebra rows or scannability tanks"*) and record it via
`ui memory record insight --refs <the job's event ids>`. On the next job, the recalled insight primes the design
prior — so the curator's standards compound instead of resetting per job.

**The verdict is the prime reflect input.** A failing axis, an uncovered criterion, or what the adversarial
refuter found is exactly the kind of thing that generalises. Record the verdict itself as a `taste_verdict` event
during ITERATE, then at LAND run the loop (`workflow-experience.md` §2d):

```bash
recall index --project .                    # embed this job's events
recall reflect job-events.json --project .  # packet: this job + what memory already knew
```

`recall reflect` never calls a model — **you** distil the one lesson (you hold the brief, the verdict and the
rounds), then run the write-back it prints. Two rules: the lesson must generalise beyond this job, and if the job
taught nothing durable, **record nothing**. Memory the curator can trust is the point; a ledger of restated
events makes the next prior worse, not better.
