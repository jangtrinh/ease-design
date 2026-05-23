# Phase 2b: HTML Autofix, Layout Validator, Registry — Dead Code Behind Green Tests

**Date**: 2026-05-22 16:47
**Severity**: High (audit found; fixed before ship)
**Component**: src/cli.ts (ui autofix, ui validate-layout, ui registry), src/core/
**Status**: Resolved

## What Happened

Phase 2b built three deterministic `ui` subcommands and shipped in commit `b8d0862`: `ui autofix` (5 HTML fix rules ported from EaseUI), `ui validate-layout` (10-check static HTML linter, net-new), and `ui registry` (JSON component store with validation). The implementation reached 269 green tests and all linting/type gates passing. Code audit found 2 CRITICAL + 5 IMPORTANT findings. All issues fixed, re-audited, and verified. Final: 293 tests, all gates green.

**BUT:** 269 passing tests coexisted with a completely non-functional feature: the image-fallback `<script>` injection in `ui autofix` was dead code. The test that should have caught this had been reframed to pass vacuously.

## The Brutal Truth

A test suite can be 99% green and still be blind to broken functionality if the test was written to pass regardless of whether the feature works. The image-fallback module had a circular guard (`!fixed.includes("__imgFallback")` could never be true because the `onerror` injection itself contains `__imgFallback`), making the entire branch unreachable. The test counting for it was changed from "does the fallback script appear in output?" to "how many `<script>` tags exist?". Both questions pass; only the first one detects the bug.

Worse: the implementer who changed the test had evidently caught that it was failing and "fixed" it by reframing the assertion. This is test-rewriting-to-hide-bugs — a trust violation that propagates silently through a CI pipeline.

## Technical Details

**Dead-code bug:** The `image-fallback` rule in `ui autofix` does two steps:
1. Inject `onerror="__imgFallback(...)"` on all `<img>` tags.
2. Inject a `<script>` tag containing the fallback handler.

The guard for step 2 was:
```javascript
if (!fixed.includes("__imgFallback")) { inject script }
```

After step 1, `fixed` always contains the literal string `__imgFallback` (from the attribute injection). The guard always evaluates to false. The script was never injected. The feature worked at 50% — images got the error handler, but no handler code existed. Silent failure.

**Audit findings (consolidated):**
- **CRITICAL #1:** image-fallback script never injected (guard tautology).
- **CRITICAL #2:** test for image-fallback reframed to count `<script>` tags instead of checking for fallback presence. Positive test missing.
- **IMPORTANT #1:** `duplicate-ids` rule was not idempotent — could create *new* duplicates on re-run.
- **IMPORTANT #2:** `empty-flex-grid` regex matched `flex-grow` and `grid-cols-3` (false positives).
- **IMPORTANT #3:** 6 of 7 layout-validator checks didn't strip HTML comments — false-positive layout smells on commented-out markup.
- **IMPORTANT #4:** registry validation schema had `additionalProperties` unlocked (accepts garbage keys).
- **IMPORTANT #5:** Phase 2a CLI parser had a modelling bug: bare `-` token stored as `flags[""] = true`.

## What We Tried

1. **Tests all green** — 269 passing. Insufficient signal.
2. **Audit probing intent** — "Does the fallback script actually reach the page?" vs. "Did the command run?" The first question surfaced the dead code.
3. **Honest positive test** — Replaced the vacuous count with a direct assertion: "the injected `<script>` tag must contain the handler function". This test fails against the broken guard, passes after fix.
4. **Idempotence testing** — Added explicit "run autofix twice, output stable" test for each rule.
5. **Regex validation** — Grepped actual HTML output, checked against expected flex/grid patterns.
6. **Comment-stripping** — All 7 layout checks now strip comments before pattern matching.
7. **Schema hardening** — Added `additionalProperties: false` to registry schema.
8. **Bonus finding:** Trivial unit test for the bare-`-` parser bug (Phase 2a leftover) surfaced a real pre-existing issue.

## Root Cause Analysis

**Why the guard was circular:**

The implementer wrote the logic sequentially (inject attribute, then check if attribute exists), without noticing that the check would always succeed after the injection. A 5-second trace through the function would have caught this. The fact that it wasn't caught suggests:
1. No code review of the logic (only "does method exist").
2. No adversarial testing ("what if we run this twice?").
3. No positive test that probes the actual behavior.

**Why the test was reframed:**

The original test was "autofix should inject fallback script on images". This test would fail against the circular guard. Someone (evidently during implementation) changed it to "autofix should produce a file with `<script>` tags". This is a weaker assertion that passes regardless of which rules fire. This pattern — reframing an assertion because it fails — is a red flag for buried bugs.

**Why the audit found it:**

Code review after tests pass asks: "given the code as written, would bad inputs be caught?" For autofix, "bad inputs" are "does the rule actually do what its name claims?" The image-fallback rule claims to inject a fallback; the audit asked for evidence. The answer was no.

**Why other rules broke too:**

The implementer ported 5 rules from EaseUI. Three of them (`duplicate-ids`, `empty-flex-grid`, `cdn-urls`) had subtle assumptions about idempotence, regex specificity, and HTML structure that didn't hold in isolation. For example, `empty-flex-grid` was tuned against a specific set of Tailwind classes and didn't account for `flex-grow` (a class with "flex" in the name but different meaning). Without integration tests that ran all rules in sequence, these edge cases went unnoticed.

## Lessons Learned

1. **A passing test suite is not proof that features exist.** When a test passes, the question is "does it pass because the feature works, or does it pass despite the feature being broken?" Only possible if the test probes the intended behavior, not a side-effect of it. Image-fallback: test "script tag exists" passes whether the script is there for the right reason. Test "script tag contains the handler function name" only passes if the feature works.

2. **Reframing a failing test is a form of lying to the suite.** If you find yourself changing an assertion because it fails, stop. Ask instead: "why did the original assertion fail?" The answer often leads to the bug. In this case, the original assertion ("inject fallback") failed because the feature was broken. Changing it to a weaker assertion hid the problem.

3. **Audit must probe intent, not output.** "Does `ui autofix` run without error?" is different from "does `ui autofix` actually apply all the rules it claims to?" The second requires understanding the feature's contract and testing whether that contract is honored. The audit's red-team thinking — "let me verify each rule actually works" — is what catches dead code.

4. **Ported code needs integration tests, not just unit tests.** `duplicate-ids`, `empty-flex-grid`, `cdn-urls` were borrowed from EaseUI. Each rule had unit tests that passed in isolation. But when chained together and applied to diverse HTML, they broke. The integration tests (run all 5 rules on diverse HTML samples, verify idempotence, verify no false positives) caught the edge cases.

5. **Verify fixes independently.** When fixing the image-fallback guard, the initial fix was to check `if (!fixed.includes("__imgFallback")) → if (step1Complete && !step2Complete)`. This was brittle and relied on implementation detail. The better fix was to change the guard to check the actual side-effect: `if (!result.includes("<script>...fallback-handler..."))`. Testing the fix means confirming the original bug test now *fails* before applying the fix, then *passes* after.

6. **Plan assumptions about code reusability are often wrong.** Phase 2b planned to port 5 rules from EaseUI "as-is". Reality: each rule needed tweaking, and the integration discovered new failure modes. Code reuse always costs more than the plan assumes.

## Next Steps

1. **All 10 audit findings fixed and verified.** Each fix backed by a direct positive test.
2. **293 tests green, all gates passing.** Commit `b8d0862` includes all fixes.
3. **Test discipline reinforced.** Future phases: write tests that fail against the bug first, then verify they pass after the fix. Don't reframe failing tests; fix the code.
4. **Audit after every phase remains non-negotiable.** Phase 1 surfaced plan gaps. Phase 2a surfaced type-checking gaps. Phase 2b surfaced dead-code gaps. Each audit found issues the suite couldn't.

---

## Reflection

269 green tests felt like a milestone. Then the audit asked "can you prove the image-fallback script actually injects?" and the answer was no. The code looked finished; the feature was broken. The most frustrating part wasn't the bug itself — it was realizing the test suite had been reframed to hide it. That's a sign of a developer under time pressure, not a sign of a robust test suite.

The port-from-EaseUI assumption burned us three times: `duplicate-ids` idempotence, `empty-flex-grid` regex, comment-stripping. Each rule was tested in isolation at the source; each failed in context. This is a lesson about test scoping: a unit test for a rule is not a license to ship it. Integration tests that prove rules compose correctly are table stakes.

The parser bug (`bare -` stored as `flags[""]`) was a bonus find. It's Phase 2a debt, but catching it in Phase 2b testing means Phase 3+ won't have to debug it. Small wins compound.

Phase 2b is solid now. The binary's core subcommands work as intended. But we shipped it at 269 tests thinking we were done, and only the audit made us honest about what "done" means.
