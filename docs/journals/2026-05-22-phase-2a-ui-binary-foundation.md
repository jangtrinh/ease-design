# Phase 2a: UI Binary Foundation — Green Tests Hide a Tautological Guard Bug

**Date**: 2026-05-22 15:34
**Severity**: High (audit found; fixed before ship)
**Component**: src/cli.ts, src/core/, ui color, ui tokens
**Status**: Resolved

## What Happened

Phase 2a built the `ui` binary's deterministic foundation and shipped it in commit `2aad203`. The build completed with 136 green tests, all linting and type-checking gates passing. Code audit found 6 issues (2 IMPORTANT, 4 MODERATE), all fixable. After fixes and verification, 148 tests green, all gates passing, ready for Phase 2b/2c.

**BUT:** A passing test suite gave us zero evidence that the composite-token type-check actually worked. The audit caught a structural tautology — comparing a value to itself — that no test could possibly trigger without explicitly probing that path. Then the fix revealed a second-order problem: the schema had a silent workaround baked in.

## The Brutal Truth

Three hours of test coverage meant nothing for one critical check. We shipped code that could silently let a `typography` token embed a color as its `fontSize`, and no suite caught it. The audit's red-team thinking — "let's check if this guard actually rejects bad inputs" — found what unit tests couldn't: a no-op check.

Worse: after we "fixed" the type-check, we discovered it was a workaround for a schema design problem. The `lineHeight` field had been mapped to the wrong type (`fontWeight` instead of `number`) to paper over the fact that the schema didn't include `number` as a valid type. We inherited a technical debt from lazy schema design, then fixed the symptom instead of the root cause.

## Technical Details

**Tautological guard:** The composite-token type validator was structured as:

```javascript
if (value !== value) { throw new TypeError(...) }
```

This condition is always false. The actual intent was to check if the value's type matched the token's declared type, but the implementation compared the value to itself. Tests like "call validate on a valid token" always pass; tests like "call validate on an invalid token" also pass because the guard is a no-op.

**Audit finding code:** Reviewer flagged: "composite-token handler does not validate field types against DTCG spec" with example "typography token with color `fontSize` should reject". Tracing the code confirmed: no type-mismatch check, and the one method named `validateType` was the tautology.

**Second-order defect:** When we fixed the type-check to do real validation, 3 tests failed. Investigation showed `lineHeight` was being cast to type `fontWeight` (a number, not a line-height). Why? The schema's `$type` enum omitted `number` — DTCG's standard type for dimensionless scalars like line-height. Past developer had mapped `lineHeight` to the closest available type to avoid schema errors.

**Root cause of schema gap:** The schema was built with an 8-entry `$type` enum (color, fontFamily, fontWeight, fontSize, fontStyle, duration, dimension, none). DTCG 2020-12 spec includes `number` as a first-class type. No one re-read the spec during schema definition.

## What We Tried

1. **Unit tests as proof of correctness** — 136 tests, all green. Insufficient.
2. **Audit probing the intent** — Reviewer walked the code asking "does this actually reject bad inputs?" Found the tautology.
3. **Direct type-check fix** — Added `typeof value !== typeof declared` check. Broke 3 tests because the workaround (lineHeight→fontWeight) was now exposed.
4. **Workaround-preserving fix** — Added special case for lineHeight. Too fragile; user rejected.
5. **Root-cause fix** — Added `number` type to schema's `$type` enum, remapped lineHeight to `number`, removed the special case. 4 new tests added for the lineHeight path. All tests green.

## Root Cause Analysis

**Why the guard was a tautology:**

The validator was likely copy-pasted from a template or written under time pressure with intent to return later. The variable names (`value !== value`) suggest a placeholder. No code review caught it because the review checked "does the method exist and have a name that looks like it validates" — not "does the method actually perform its validation". The test suite didn't catch it because no test case tried to pass an invalid type; all test tokens were well-formed.

**Why the schema was incomplete:**

The schema author read the DTCG spec but didn't enumerate all types. A quick check against the spec would have listed: color, fontFamily, fontWeight, fontSize, fontStyle, duration, dimension, number, **string**, **boolean** — and we'd only picked 8. The lineHeight workaround was a band-aid on schema laziness.

**Why the audit found it:**

The code-reviewer's mandate was to think like an adversary: "what inputs would break this?" For a type-check, the adversary tries mismatched types. A unit-test mindset tries "what's a valid case?"; an audit mindset tries "what's the worst case?". Different modes catch different bugs.

## Lessons Learned

1. **Passing tests are not proof of correctness.** A tautological guard passes every test except the one that directly exercises the tautology. Test coverage metrics are vanity — they report how many lines executed, not whether those lines do what they claim. Audit/review must ask "is this check *actually* enforcing the rule, or does it just look like it is?"

2. **Verify fixes against the original problem.** After fixing the type-check, we had to step back and ask: "why did the workaround exist?" instead of just unblocking the test. The answer led us to a deeper schema design issue. Rushing the fix would have left the workaround in place, a landmine for the next developer.

3. **Spec enumeration must be exhaustive or locked.** If you're implementing a spec, enumerate it once, check against source, write it down. Don't estimate or "good enough". The DTCG spec is 4 pages; checking it against our schema took 10 minutes and caught 4 missing types. Back-of-napkin schema design is expensive in later phases.

4. **Runtime tautologies are invisible in local development.** You can't debug what looks correct. Code review + adversarial testing (audit) are the only tools that catch this pattern. Static type-checking (TypeScript) would have caught this if we'd declared the value's type explicitly and compared it to a declared type field, but runtime types are fuzzier. The moment there's `any`, a tautology lives longer.

5. **Audit discipline pays off, full stop.** Phase 2a looked ready at "tests green". The audit said "I'm skeptical that type-check works" and found 6 real issues. Three of them (tautology, schema incompleteness, flag-parsing bug) would have shipped and caused pain in Phase 3+. Running the audit isn't a checkbox; it's a gate.

## Next Steps

1. **All 6 audit findings fixed.** Tautology → real type-check, schema completed with `number`, flag parser hardened. 4 new tests added to exercise the fixed paths.
2. **Commit `2aad203` + follow-up commit with type-check / schema / tests.** All gates green.
3. **Phase 2b/2c can now assume solid type-checking and token validation** — no surprises waiting.
4. **Audit after every phase is now non-negotiable.** Phase 1 proved plan gaps; Phase 2a proved test gaps. Both audits found real, fixable issues. Keep the discipline.

---

## Reflection

Green tests felt like the finish line. Then the audit asked a single question ("does this type-check actually reject bad inputs?") and suddenly the code looked broken. The humbling part: the tautology was *simple* — you can't miss it if you read the line carefully. But we all missed it because we trusted the test count, not the test intent.

The schema incompleteness stung worse because we inherited it from Phase 1 work (the planner who designed the schema didn't cross-check the spec). We fixed the symptom (lineHeight workaround) before we understood the disease (missing types). The user's push-back on the workaround fix forced us to do the work right. Small moment of friction that prevented technical debt.

Phase 2a is solid now. But we're running Phase 2b/2c without the confidence we should have. Tests passing is table stakes. Audits are how you actually build.
