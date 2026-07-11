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
   - `spec.json` = the brief's `{ acceptanceCriteria:[{id,text,evidence?:[ids]}], successMetrics?:[...] }`.
   - `manifest.json` = the produced design's `{ screens:[{ name, coversCriteria:[ids], states:[...] }] }`.
   - It reports `uncovered[]` + `coveragePct` and exits 1 if any criterion is uncovered. **Zero-token, zero-LLM.**
   Every acceptance criterion MUST map to a covering screen/state — no silent gaps. Uncovered = fix before ship.
   - **Coverage accounts a self-report; it does not prove the design meets the brief.** Both the criteria and the
     `coversCriteria` claims are authored by the model — a design can score 100% against criteria it invented. So:
     - Criteria drawn from a brief/requirement carry `evidence:[ids]`. Run with **`--require-evidence`**: any
       criterion with no evidence is an **ASSUMPTION**, reported as debt and **never counted as real coverage**
       (`evidencedCoveragePct`). This is the same discipline as an `insight` needing `--refs`.
     - Present the honest number: *"N% covered, of which M% evidence-backed; the rest are stated assumptions."*
       Never report assumption coverage as if the brief were satisfied.
2. **Goal plausibility (judgment).** Does the design plausibly move the INTENT's success metric? Judge against
   `ux-psychology.md` (the laws the brief triggers) — e.g. an activation flow must minimize per-step friction; a
   pricing page's persuasion must be **honest** (no dark patterns / fake scarcity — ux-psychology's ethical
   persuasion rules are a HARD gate, not a nicety).
3. **Accessibility gate (deterministic — a HARD FLOOR, above aesthetic fidelity).** WCAG contrast
   (`ui color contrast`), focus order / keyboard reachability, ARIA-able structure. A contrast fail is a fail, not
   a nit. Two rules that override everything else on this axis:
   - **A11y beats the style source.** When a persona/style DNA supplies a token or literal (`bg-[#8A909C]`) that
     fails contrast, the a11y floor **wins** — re-run the pair through `ui color contrast`; fix the token, do not
     honor the aesthetic. (Secondary/muted text ~#8A-lightness on white ≈ 3.2:1 fails AA — a recurring trap.)
     Interactive icons must be real glyphs/SVG with an accessible name — **never** an emoji or text character
     (× ▶ ☰ → ‹ ›) as a control.
   - **Never claim what a static check cannot prove.** Contrast math and structural checks verify *declared token
     pairs and markup* — not rendered contrast over gradients/images, not focus visibility, not whether the focus
     order is meaningful. So the verdict says *"N deterministic a11y checks passed; these criteria (list) need
     human/assistive-tech judgment and were not evaluated"* — it must **never** state "accessible" or
     "WCAG AA compliant" from a static/token-only run.

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
