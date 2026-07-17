# Phase 02 — The honest router

> **Executor: Sonnet.** Independent of Phase 1 and of the code road — it can land in parallel.
> One traversal-order change and two additive envelope fields. Small diff, load-bearing effect:
> `ui scan` **is** the router the whole E2 road stands on, and today it cannot be trusted.

## Context Links

- Spec `spec.md` §Acceptance 3 · Plan `plan.md` Phase 2 · Tasks `tasks.md` T2
- `usecases.md` UC-01, UC-02 (Gherkin lives there — use it verbatim)
- `brainstorm.md` R1 (root cause, live-reproduced)
- Dogfood: `feedbacks/260717-dana-desktop-onboarding.md` F10 — **whose diagnosis was wrong**;
  read R1 for what is actually broken
- Constitution: Art I (deterministic — **read Key Insight 1 before touching the walk**),
  Art II, Art VIII (honesty floors)

## Overview

- **Priority**: first, alongside Phase 1. **Depends**: nothing. **Blocks**: Phase 3, Phase 4.
- **Status**: not started.
- **Description**: `ui scan` walks depth-first, alphabetically, and gives up at 4000 entries
  **with no signal**. On dana it reports `ok: true, cssFiles: 0` while `dana-tokens.css` sits
  right there. Make the walk breadth-first and make the envelope admit truncation.

## Key Insights (each is a trap in the existing code)

1. **The alphabetical order is a DELIBERATE DECISION — do not remove it.**
   `project-scan.ts:6-8`, verbatim: *"The directory walk visits entries in **sorted
   (alphabetical) order so results are byte-identical across runs** — including when the
   4000-entry cap truncates a huge tree."* That is Art I ("same input → same bytes, forever").
   **BFS does not break it**: determinism comes from *sorting*, not from *depth-first*. BFS with
   the same alphabetical sort **within each level** is equally byte-identical. Keep `sortedEntries`
   (`:108`) exactly as it is; change only the traversal order. **Update that header comment** so
   the next reader does not think BFS violated the decision.
2. **The author already knew about truncation.** The same sentence says "including when the
   4000-entry cap truncates a huge tree". Truncation was anticipated and made deterministic —
   it was just never *reported*. That is what makes `truncated` an Art VIII fix and not a
   redesign. Do not raise or remove the cap.
3. **`SKIP_DIRS` (`:40-42`) is already correct** — `node_modules, dist, build, out, coverage,
   vendor, .git, .next, .turbo, .cache, .agent, .claude, design`. It already excludes EaseUI's
   `.claude/worktrees/*` decoys. **Do not touch it.** The filed diagnosis ("scan cannot see
   below root") was wrong; the walk works.
4. **`slice(0, 5)` on cssFiles/htmlFiles is a DECLARED contract**, not a silent truncation —
   `:24` *"Top 5 .css files by size (bytes desc, then path asc)"*. It matches `learn.md` §3a
   ("prefer the largest file per surface", 3-5 files). **Leave it. Do not add a flag for it.**
5. **`componentDirs` is sorted alphabetically by path (`:188`), not by `files` count** — while
   `learn.md` §3a says *"prefer … the component directories with the most files"*. Not broken
   (the `files` count is in the payload; the consumer can rank), but unhelpful. See D3.
6. **The verdict can be right for the wrong reason.** `:197` — `componentDirs.length > 0 ||
   framework !== null`. On dana, `framework: react` came from `package.json` alone and produced
   `brownfield-code` with `componentDirs: []`. The dogfood said exactly this. **Do not "fix" the
   verdict** — with `truncated` reported, the wrongness becomes visible, which is the point.
7. **This is why dana failed.** `src/` alphabetical: `agent-servers · backend · config ·
   dana-ontologist(415 files) · desktop-ui`. Depth-first burns the budget four directories
   before the UI. BFS visits all 8 of `src/*` before descending into any of them.

## Decisions (RESOLVED)

### D1 — BFS, same sort, same cap

Replace the recursive depth-first `walk` (`:112-140`) with an explicit breadth-first queue.
Within each level, entries keep `sortedEntries`' alphabetical order. `MAX_DEPTH = 6` and
`MAX_ENTRIES = 4000` are unchanged. `acc.visited` accounting is unchanged.

*Why BFS:* UI directories are shallow; service subtrees are deep. The budget is not too small —
it is spent in the least informative order. Same 4000 entries, spent breadth-first, reach
`src/desktop-ui` on the first `src/` sweep.

### D2 — `truncated` + `visited` are additive envelope fields

```ts
/** True when the walk hit MAX_ENTRIES or MAX_DEPTH and the map is therefore partial. */
truncated: boolean;
/** Directory entries visited. Equals MAX_ENTRIES when truncated by the entry cap. */
visited: number;
```
Additive only — no existing field changes shape. **`truncated` stays in the contract even if the
cap later moves**; it is the honesty surface, not a tuning artefact (Art VIII: *"say exactly what
they checked"*).

### D3 — do NOT re-sort `componentDirs`; document the rank instead

`learn.md` §3a already owns the picking doctrine ("the component directories with the most
files"). The scan reports **all** candidates with their `files` counts; the consumer ranks. This
is what makes EaseUI's two legitimate UI roots (`app/src/components`,
`frontpage/app/src/components`) a non-problem: **scan does not choose — it reports, sorted
stably; `learn.md` chooses.** *This resolves `tasks.md` OQ1 without a flag, without a question,
and without code.*

### D4 — `learn.md` surfaces truncation in its step-1 summary

`learn.md` step 1 already mandates a one-paragraph summary. It gains one rule: **if `truncated`,
say so before the verdict.** An `ok: true` with `componentDirs: []` and `truncated: true` must
read as *"the budget ran out before any UI was found"*, never *"this project has no components"*.

## Related Code Files

**Modify**
- `src/core/project-scan.ts` — D1 (`:112-140`), D2 (the `ScanResult` interface ~`:20-35` + the
  return ~`:201`), and **the header comment `:6-8`** (Key Insight 1). Currently ~210 lines;
  BFS should not grow it materially (Art IX).
- `templates/workflows/learn.md` — D4 (step 1).
- `tests/cmd-scan.test.ts` (or the existing scan test file — find it, do not create a duplicate).

**Never**: `SKIP_DIRS` (`:40-42`), `sortedEntries` (`:108`), the `slice(0,5)` contract, the
verdict logic (`:196-199`), `MAX_DEPTH`/`MAX_ENTRIES` values.

## Architecture

```ts
// BFS: a queue of {dir, depth}. Component-dir detection happens as each dir is dequeued —
// the same check that runs today at :117-125, unmoved.
function walk(root: string, start: string, acc: WalkAccum): void {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: start, depth: 0 }];
  while (queue.length > 0) {
    if (acc.visited >= MAX_ENTRIES) { acc.truncated = true; return; }
    const { dir, depth } = queue.shift()!;
    if (depth > MAX_DEPTH) { acc.truncated = true; continue; }   // depth cap also truncates
    const entries = sortedEntries(dir);                          // UNCHANGED — Art I
    // …component-dir detection (as today, :117-125)…
    for (const e of entries) {
      if (acc.visited >= MAX_ENTRIES) { acc.truncated = true; return; }
      acc.visited++;
      // …dirs → queue.push({dir: full, depth: depth+1}); files → classify (as today)…
    }
  }
}
```

## Implementation Steps

1. Add `truncated` to `WalkAccum` + `ScanResult`; add `visited` to `ScanResult` (it is already
   on `WalkAccum` at `:98`).
2. Convert `walk` to the BFS queue above. **Set `truncated` at BOTH cap sites** — the entry cap
   and the depth cap.
3. Update the header comment `:6-8` to state that the *sort* (not the traversal order) is what
   guarantees byte-identical results, and that the walk is breadth-first so a shallow UI is
   found before a deep subtree consumes the budget.
4. `learn.md` step 1 (D4).
5. Tests below. Four gates + `npm test`.

## Tests — file, name, assertion

- `test_a_ui_behind_an_alphabetically_earlier_large_sibling_is_found` → fixture:
  `src/aaa-service/` with enough files to exhaust a lowered cap, `src/zzz-ui/` with a css file
  and a components dir. Assert `zzz-ui` appears. *Pins the dana pathology. Depth-first fails
  this; BFS passes.*
- `test_scan_is_byte_identical_across_runs` → run twice on the same fixture, assert deep-equal.
  *Pins Art I and the decision at `:6-8` that BFS must not break.*
- `test_a_tree_over_the_cap_reports_truncated_true_and_visited` → `truncated === true`,
  `visited === MAX_ENTRIES`.
- `test_a_tree_under_the_cap_reports_truncated_false` → the only honest way to say "no UI here".
- `test_a_tree_over_max_depth_reports_truncated` → the depth cap truncates too (Step 2).
- `test_truncated_does_not_change_any_existing_field_shape` → additive-only (D2).
- `test_component_dirs_carry_their_file_counts_and_a_stable_order` → D3; both EaseUI-style roots
  present, `files` populated, order stable.
- **LIVE (Art III), run it and put the output in the report**:
  `ui scan --cwd /Users/jang/Products/dana-desktop --json` must report `src/desktop-ui` in
  `componentDirs` and `dana-tokens.css` in `cssFiles`. Today: `cssFiles: 0, componentDirs: 0`,
  no truncation field. Also run it on `/Users/jang/Products/EaseUI` (no root `package.json`,
  62 nested, 2 UI roots) and record what happens — **not** a gate condition, just evidence.

## Success Criteria

1. `ui scan --cwd <dana>` reports `src/desktop-ui` and `dana-tokens.css`. **This is the finding
   that motivated the phase; it must be demonstrated live, not by fixture.**
2. `truncated` + `visited` on every scan envelope; `truncated: true` whenever either cap bites.
3. Two runs on the same tree are byte-identical (Art I preserved — Key Insight 1).
4. `SKIP_DIRS`, `slice(0,5)`, the verdict logic and both cap values are untouched.
5. `learn.md` step 1 surfaces truncation before the verdict.
6. `project-scan.ts` stays ~210 lines (Art IX). Four gates + `npm test` green.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **BFS reads as a violation of the `:6-8` determinism decision** | It is not — the sort is what guarantees byte-identity, not the traversal order. Step 3 rewrites the comment so the next reader sees that immediately, and `test_scan_is_byte_identical_across_runs` proves it. **This nearly became a wrong recommendation: the decision was found only by reading the header.** |
| BFS changes which entries survive truncation, so some scans report *different* (not more) results | True and intended — that is the fix. Any fixture asserting a depth-first-shaped result is asserting the bug. If an existing test breaks this way, **report it**; do not silently re-baseline. |
| A queue-based walk is slower / holds more memory on a wide tree | The cap bounds it at 4000 entries either way. If a wide-shallow repo is measurably worse, report the number — do not pre-optimise. |
| `truncated` is reported but nothing consumes it | D4 wires `learn.md`. Without a consumer the field is decoration — the Art II pairing is emitter (field) + consumer/check (the summary rule + the tests). |

## Security Considerations

None new. The scan is read-only, no network, no writes (`:1-9`). BFS visits the same set of
directories under the same `SKIP_DIRS`.

## Deviations from `plan.md` (report at the gate)

1. **`plan.md` OQ1 ("EaseUI's genuine tie — largest wins, or ask?") is answered by D3 with
   neither.** `componentDirs` is already an array with counts; the scan reports, `learn.md` §3a
   ranks. No flag, no question, no code.
2. **The depth cap also sets `truncated`** — `plan.md` only discussed the entry cap.
3. **The header comment `:6-8` changes.** It documents a decision BFS keeps but re-words; call it
   out so the reviewer reads it as intentional.

## Next Steps

- Phase 3 (the vocabulary) consumes `cssFiles` from this envelope — it cannot be trusted until
  this lands.
- Phase 4's `learn.md` §3a sampling consumes `componentDirs` + the `files` counts (D3).
