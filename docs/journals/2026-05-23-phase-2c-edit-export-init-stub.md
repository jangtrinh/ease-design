# Phase 2c: Edit / Export / Init Stub — Plan Caught the Real ZIP Problem, Audit Caught Plan References Leaking into Code

**Date**: 2026-05-23 09:15
**Severity**: Medium (audit found; fixed before ship)
**Component**: src/cli.ts (ui edit-strategy, ui strip-fences, ui parse-json-stream, ui export, ui init), src/stdin-reader.ts
**Status**: Resolved

## What Happened

Phase 2c built five deterministic `ui` subcommands and shipped in commit `294bf6f`: `ui edit-strategy` (surgical HTML edits via ln-diff ported from EaseUI), `ui strip-fences` and `ui parse-json-stream` (adapter post-processors), `ui export` (single-file HTML export with cleanup), and `ui init --runtime <r>|--all` (adapter generator stub). Refactored `stdin-reader.ts` to DRY up stdin consumption across Phase 2b and 2c. Implementation reached 414 tests, all gates passing. Audit found 2 IMPORTANT findings + 1 observation. Both findings fixed, re-tested, verified. Final: 418 tests, all gates green.

**BUT:** The original implementation leaked plan-taxonomy references (`Phase 2c`, `Phase 6`, `OD-1`) into user-facing error messages and code comments. A future developer reading the code a year from now would see `"see plan OD-1"` with no context for what "OD-1" is — it's a finding code from a plan artifact that gets renumbered or deleted. Same for phase numbers in inline comments.

## The Brutal Truth

The plan is not stable documentation. Phase numbers change when phases get split or merged. Finding codes (`OD-1`, `F13`) exist only in the plan file and become dangling references the moment the plan file moves or gets reorganized. Yet three error strings and six code comments in production code referenced them directly. A user hitting `parseJsonStream` error would see "see plan phase OD-1", which means nothing without the plan context. And once the plan is archived or regenerated, that string is archaeological noise.

This is a violation of the rule stated in `.claude/rules/review-audit-self-decision.md` §5: "Code comments and artifact naming must not reference plan artifacts". We broke it in the rush of implementation. The audit caught it. The fix was mechanical (rewrite to explain the *why*, not the origin), but the fact that it got in at all means the rule isn't automatic.

## Technical Details

**User-facing messages with plan codes:**
- `ui export --zip` error: `"ZIP export deferred per open-decisions OD-1; see plans/ease-design/brainstorm.md for rationale"` → Rewrote to `"ZIP export not implemented in v1; zero-dependency ZIP support would require ~400 LoC of DEFLATE + container logic beyond current scope"`.
- `ui init --all` pre-flight message: `"Phase 6 adapter generation is stubbed; writing sentinel manifest"` → Rewrote to `"Adapter generation is stubbed; writing JSON sentinel with status: 'stub' for each runtime"`.

**Code comments with plan references:**
- `src/cli.ts` edit-strategy handler: `// TODO: Phase 2c ported ln-diff from EaseUI; Phase 6 adds --apply-mode` → Rewrote to `// TODO: --apply-mode deferred; requires multi-way merge logic for conflict resolution`.
- `src/core/export.ts` minify step: `// Phase 2c: cleanup; see F13 for accessibility passes` → Rewrote to `// Removes ARIA bloat, deduplicates classes, minifies markup; see cleanupMarkup() for specifics`.

Audit also flagged `parse-json-stream` docstring claiming mid-stream malformed JSON would be in `remainder`, but tests (and code) silently discarded it. Fixed by aligning docstring and code: "malformed mid-stream JSON spans are discarded" + test asserting `remainder.trim() === ""` after malformed input.

## What We Tried

1. **Original implementation shipped with plan references intact.** Tests all green; CI passed. No local linting caught it (grep for plan codes not in default ruleset).
2. **Audit review asked: "Will this code make sense in a year?"** Reading error messages and comments, reviewer spotted `OD-1`, `Phase 2c`, `Phase 6` and flagged them as dangling. Also flagged docstring inconsistency in `parseJsonStream`.
3. **Mechanical rewrite.** Replaced each plan reference with plain-English explanation of the decision or constraint. `OD-1` → 400-LoC cost + YAGNI rationale. `Phase 6` → "adapter generation stubbed, sentinel written". `Phase 2c` → feature name or behavior constraint.
4. **Test-docstring-code alignment.** `parseJsonStream` docstring claimed behavior the code didn't implement; test was vague. Fixed by choosing "code wins, docstring follows, test asserts the real behavior."
5. **Grep verification.** Final pass: `grep -rE "Phase [0-9]|OD-[0-9]|F[0-9]|Finding|finding" src/` returned zero. Plan codes gone from code.

## Root Cause Analysis

**Why plan codes leaked into code:**

Implementation phases 2a/2b/2c ran tightly coupled with plan review. When writing error text or inline comment, the developer was fresh off reading the plan, so `"see OD-1"` felt natural — the finding was right there in working memory. No enforcement (linting rule, grep-in-CI) caught it. The rule exists in `.claude/rules/` but isn't automated; it relies on review discipline.

**Why the ZIP deferral was phrased as "OD-1" instead of "rationale":**

The implementer knew the decision was documented in the plan (a finding from the brainstorm). Rather than re-derive or paraphrase the logic, they referenced the source. This is laziness masquerading as correctness: "it's accurate (OD-1 does discuss this), so it's fine." But accuracy isn't the goal; survivability is. The error message must stand alone.

**Why docstring drifted from code:**

The `parseJsonStream` docstring was written first (spec-first style), then the implementation diverged slightly (discarding malformed spans instead of preserving them). The code was correct for the use case; the docstring was aspirational. Tests passed because they were written against the code, not the docstring — a gap that audit caught.

## Lessons Learned

1. **Plan is a working document, not a stable reference.** Phase numbers get renumbered when phases split (e.g., Phase 2 → 2a/2b/2c). Finding codes get shuffled on re-audit. Code that references them will become archaeological noise. User-facing text especially must be self-contained: explain the decision (cost, constraint, scope) inline, never by reference to a plan artifact. If the plan changes, the code doesn't have to.

2. **Code comments that reference the plan are a form of technical debt.** "See Phase 2c" is not a comment; it's a TODO without a completion condition. "Deferred because of concern X" is a comment. The first breaks when the plan moves; the second survives plan reorganization. Audit discipline: zero plan references in code, always derive the reason inline.

3. **Docstring-code-test must form a triangle, not three separate stories.** When a docstring and code diverge, the test acts as tiebreaker: "does the test exercise the documented behavior?" If yes, code is wrong. If no, docstring is wrong. Don't leave the triangle unresolved. In this case, tests were written against actual code behavior, so docstring was wrong. Fix by updating docstring and adding a positive test asserting the real behavior — a test that would fail if the behavior changed.

4. **The --zip deferral was honest YAGNI.** ~400 LoC for zero-dep ZIP (DEFLATE + container) is real. Phase 1 needs it; v1 doesn't. Rather than stub-out or hand-wave, state the cost plainly: "not worth the LOC budget for v1." That's decision-making, not laziness. The problem was expressing it via plan code instead of cost + rationale.

5. **Grep for plan artifacts is cheap enforcement.** `grep -rE "Phase [0-9]|OD-[0-9]|F[0-9]" src/` takes 100ms and would catch this class of leak. Add to pre-commit hook or CI if the rule matters (and it does — plan stability is fragile).

## Next Steps

1. **All 2 audit findings fixed.** Plan references removed from code and messages. Docstring-code-test aligned for `parseJsonStream`.
2. **418 tests green, all gates passing.** Commit `294bf6f` includes all audit fixes.
3. **Phase 2 (a/b/c) fully complete.** Eight `ui` subcommands + three subverbs (edit-strategy select/number-lines/apply), all deterministic, all tested.
4. **stdin-reader.ts refactor consolidates stdin consumption** — no more duplication across 2b/2c; Phase 3 can reuse for new commands.
5. **Audit discipline is sticky.** Phases 1, 2a, 2b, 2c all went through review-fix-reverify cycle. Real issues found (tautologies, dead code, dead-code-hiding tests, plan-reference leaks). Keep it.

---

## Reflection

The implementation felt clean — 414 → 418 tests, all green, determinism intact. Then audit asked "will this code make sense after the plan is archived?" and the answer was no. The error strings would reference `OD-1`, a finding code that exists only in a working document. The comments would mention `Phase 2c`, which becomes stale the moment someone renumbers the phases.

This pattern is insidious because it *feels right* in the moment. You're writing an error message, you know the decision came from OD-1 in the plan, you write it. No one catches it because the code "works" and the reference is accurate. But it's a form of technical debt that gets worse over time — every archived plan file leaves behind a trail of broken references in code.

The fix was simple (rewrite to explain the *why* inline), but the lesson is about discipline. A rule written in a markdown file doesn't enforce itself. It needs either automation (grep-in-CI) or review discipline (auditor reads for plan references). We went with review discipline and it worked — but the fact that it got in at all means the rule needs sharper teeth, either through tooling or through making it visible at code-review time.

Phase 2 is complete. The `ui` binary has solid deterministic foundations. But we've also learned (hard way, through four phases of audits) that test passing and code compiling are not the same as code being correct, and that code being correct is not the same as code being maintainable by someone who doesn't have the plan context in working memory.
