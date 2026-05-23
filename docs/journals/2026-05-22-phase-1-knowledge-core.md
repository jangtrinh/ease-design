# Phase 1: Knowledge Core Shipped — But Plan Had Critical Gaps

**Date**: 2026-05-22 14:47
**Severity**: Medium
**Component**: knowledge/ directory, eslint config, phase planning
**Status**: Resolved

## What Happened

Phase 1 knowledge core executed successfully: 15 Markdown files (~2,700 lines) built across parallel agent streams, code-reviewed, and committed to `main`. The knowledge base distills EaseUI's design engine into runtime-neutral reusable assets: taste rubric, 23 personas, mode constraints, component catalog, color science, token taxonomy.

**BUT:** The phase succeeded despite the plan being demonstrably incorrect at several critical points. We caught these gaps mid-execution and corrected them. If we hadn't, the next phase would have started from stale scope.

## The Brutal Truth

The plan was written without validating its claims against the source. Three categories of stale assumptions:

1. **Lint was broken** — Phase 0 claimed "lint green", but `.claude/` agent tooling got dropped in post-commit. Local `npm run lint` exploded at 3329 errors. This is a latent CI landmine: the moment `.claude/` gets committed (and it will), CI fails. We didn't discover this until code-review stage.

2. **Plan scoped wrong** — Phase 1 was supposed to build 40+ personas, but the actual source has only 23 distinct family archetypes. The brainstorm noted 40+ as "futures", but the plan didn't distinguish. We executed against the real 23, not the plan's promise of 40+.

3. **Component count was wrong** — We estimated 24 components in the catalog. The actual source has 32. Minor but it erodes confidence in the plan's other numbers.

4. **Dependency inversion in Phase 2** — The plan defined two DS JSON schemas in Phase 3, but Phase 2's `ui tokens` and `ui registry` subcommands *need* those schemas to emit valid JSON. We caught this and moved the schemas into Phase 2a during the split. The original ordering would have forced either: (a) stub out schemas, or (b) defer phases 2–3 entirely.

## Technical Details

**Lint failure root cause:** ESLint flat config does NOT read .gitignore (unlike old .eslintignore). Adding `.claude/` to .gitignore alone would fix CI, but not local dev loops. The real fix: scope eslint to project code only — `eslint src tests` instead of `eslint .` — so agent tooling is never swept up. Applied in commit `5d45e9c`.

**Component count reality check:** Grepped EaseUI source, confirmed 32 distinct component types (Button, Select, Dropdown, etc.). Plan estimated 24. Discrepancy documented; plan corrected to 32.

**Schema dependency:** Phase 2a now contains both DS schema definitions; Phase 2b and 2c consume them. Verified that token registry and mode constraints both validate against the schemas — dependency graph is now acyclic.

**Persona math error (code review):** Reviewer flagged the worked example in `persona-index.md`. Initial inspection: "scores match after correction, final picks unchanged." Wrong. The arithmetic fix (fixing divisor and rounding) also shifted the 3rd-ranked persona from `industrial-blueprint` to `liquid-glass`. Independently verified and corrected. Single-point-failure: if we'd trusted the reviewer's incomplete diagnosis, the doc would have shipped with a contradiction (corrected math, wrong conclusion).

## What We Tried

1. **Quick local lint fix** — Added `.claude/` to .gitignore. Still failed locally. Realized eslint doesn't respect gitignore; switched to scoped eslint path.
2. **Validated persona count** — Grepped EaseUI component-factory files. Confirmed 23 families, not 40+.
3. **Traced component catalog** — Enumerated all exports from design system. Found 32, not 24.
4. **Checked Phase 2 dependencies** — Built a minimal schema stub. Discovered Phase 2 code couldn't validate tokens without it; moved schemas forward.
5. **Double-checked persona math** — Ran the weighted-score calculation by hand. Caught the rounding error and verified the consequence (3rd pick changes).

## Root Cause Analysis

**Why the plan diverged from source:**

The plan was drafted from a high-level reading of the implementation-plan.md brainstorm, not a full code audit. Three specific oversights:

1. **Lint config not re-verified post-Phase-0.** The plan said "Phase 0: lint green" based on the commit state, but `.claude/` tooling got added *after* the commit. No one re-ran lint to see if the claim still held. This is a process failure: plan should snapshot the actual state, not the state at commit time.

2. **Persona count conflated with backlog.** The brainstorm mentioned "40+ personas for future versions" in a risk/scope section. The plan inherited "40+" without marking it as out-of-scope for v1. Should have been explicitly "v1: 23 (core families); v2+: 40+ (extended palette)".

3. **Component catalog was never enumerated.** We relied on a back-of-napkin estimate (24) instead of grepping the source once. A 5-minute audit would have caught the 8-component gap.

4. **Phase sequencing not validated.** No one walked the Phase 2 code to check what inputs it actually needed. The schema dependency was implicit in the code, not explicit in the plan.

## Lessons Learned

1. **Plan must validate claims against source code.** "Lint green" claims must be re-verified after *any* post-commit changes. Same for counts, enums, schema definitions. A plan that doesn't match the code *will* cause phases to collide.

2. **Distinguish scope tiers in the plan.** v1/v1+/v2, core/extended/future must be explicit. Personas example: say "23 core families (locked for v1)", not "40+ personas" without marking which are deferred.

3. **Enumerate enums and lists before scoping.** Component catalog, mode types, token categories — these should be grepped once, written into the plan, and locked. Estimates lead to 8-unit surprises mid-phase.

4. **Trace data flow to expose schema/interface dependencies.** Before Phase N is "done", walk the code path for Phase N+1. Does it import from Phase N? Does it validate against schemas defined in Phase N? If yes, document it in the plan. The schema-in-Phase-3 → needed-in-Phase-2 inversion was predictable if we'd walked the code.

5. **Review findings must be independently verified.** When a reviewer says "math is right but conclusion is unchanged", re-check the conclusion yourself. The math fix had a consequence the reviewer missed.

## Next Steps

1. **CI landmine removed.** Lint scoping committed. Local and CI will stay green.
2. **Plan corrected in EaseUI repo.** Phase 1 scoped to 23 personas (locked); Phase 2 split into 2a/2b/2c with schemas pulled forward; Phase 3 updated. Component count now 32. All corrections reflected in implementation-plan.md.
3. **Knowledge core committed.** 15 files, all code-reviewed and corrected, on `main` (not pushed yet). Ready for Phase 2.
4. **Next session:** Phase 2 implementation. Start with Phase 2a (DS schemas + type stubs) so Phase 2b/2c have the foundations they need.

---

## Reflection

The session felt like running code against a stale plan — and then frantically backfilling the plan mid-run. Not ideal, but the discipline of "pause, correct, commit" worked. The plan is now grounded in source reality, not napkin math. That matters for the next 7 phases. The alternative (shipping Phase 1 and discovering dependencies in Phase 3) would have been far more expensive.

The persona-math review lesson stung a little: we almost shipped a doc with a silent contradiction because we took a reviewer's claim at face value without re-running the arithmetic. For a design system built on numeric precision (color math, token scaling, taste scoring), that's embarrassing. Next time: always re-derive, never trust the summary.
