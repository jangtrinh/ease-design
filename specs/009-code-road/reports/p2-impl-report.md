# Phase 02 — The honest router — implementation report

Branch: `spec009/p2-honest-router` (off `main`).

## What changed

- `src/core/project-scan.ts` (206 → 224 lines):
  - Header comment (`:1-15`) rewritten: byte-identical results come from the **sort**, not
    traversal order; the walk is now breadth-first; either cap sets `truncated`.
  - `ScanResult` gained `truncated: boolean` and `visited: number` (additive only, D2).
  - `WalkAccum` gained `truncated: boolean`.
  - `walk()` rewritten from recursive depth-first (`walk(root, dir, depth, acc)`) to an explicit
    FIFO-queue breadth-first walk (`walk(root, start, acc)`), per the phase file's architecture
    sketch. `truncated` is set at **both** cap sites (entry cap in the `while` and the inner
    `for`, and the depth cap). `sortedEntries` is untouched — entries within a level keep
    alphabetical order.
  - `scanProject()` initializes `truncated: false` on the accumulator and returns
    `truncated: acc.truncated, visited: acc.visited` on the result.
  - Untouched, as instructed: `SKIP_DIRS`, `sortedEntries`, the `slice(0, 5)` contract, the
    verdict logic, `MAX_DEPTH`/`MAX_ENTRIES` values, component-dir detection logic, the
    alphabetical `componentDirs` sort (D3 — no re-sort).
- `templates/workflows/learn.md` step 1 (D4): field list now names `truncated`/`visited`; added
  a "Truncation comes first" rule — if `truncated`, say so **before** the verdict, and never read
  an empty `componentDirs` + `truncated: true` as "no components here."
- `tests/cmd-scan.test.ts` (existing file, no duplicate created): added the 7 tests named in the
  phase file, verbatim (`test_a_ui_behind_an_alphabetically_earlier_large_sibling_is_found`,
  `test_scan_is_byte_identical_across_runs`, `test_a_tree_over_the_cap_reports_truncated_true_and_visited`,
  `test_a_tree_under_the_cap_reports_truncated_false`, `test_a_tree_over_max_depth_reports_truncated`,
  `test_truncated_does_not_change_any_existing_field_shape`,
  `test_component_dirs_carry_their_file_counts_and_a_stable_order`).

`src/commands/scan.ts` was **not** modified — it wasn't in the phase file's "Related Code Files"
list, and `okJson(CMD, result)` already spreads the full `ScanResult` (including the new fields)
into the JSON envelope with no changes needed. The text formatter doesn't surface `truncated`;
the phase file scoped the truncation-surfacing requirement to `learn.md` step 1 (D4), not the CLI
text output, so I left it alone.

## A note on the fixture for `test_a_ui_behind_an_alphabetically_earlier_large_sibling_is_found`

The phase file's fixture sketch says "enough files to exhaust **a lowered cap**" but the hard
constraint says never touch `MAX_ENTRIES`/`MAX_DEPTH`. Read literally, "a lowered cap" isn't
achievable without touching the constant, so I built the fixture against the real 4000-entry cap
instead: `aaa-service`'s full recursive subtree (10 × 10 dirs × 50 files = 5000+ entries) exceeds
the cap on its own, so an (old) depth-first walk exhausts the whole budget *inside* `aaa-service`
and never even starts `zzz-ui`, which pins the dana pathology under the real cap value. Under BFS,
`zzz-ui/components` (2 levels deep) is discovered long before the walk gets that deep into
`aaa-service`, so the test asserts the component dir + css file are found — it does not assert
`truncated`'s value, since with a fixture large enough to prove the DFS failure, `truncated` will
honestly end up `true` (the walk still runs out of budget later, deep in `aaa-service`, after
already finding the UI). Flagging this since I read the sketch's wording as advisory rather than
literal — happy to revisit if that reading was wrong.

## Four gates

- `npm run typecheck` — **PASS** (no output, exit 0).
- `npm run lint` — **PASS** (no output, exit 0).
- `npm run build` — **PASS** (`dist/cli.js` 796.19 KB, tsup build success).
- `npm test` — **PASS**: 129 test files, 1970 passed, 4 skipped, 0 failed. No existing test
  broke — nothing was asserting the depth-first-shaped bug.

## LIVE run 1 — dana-desktop (Art III)

```
$ node dist/cli.js scan --cwd /Users/jang/Products/dana-desktop --json
{
  "ok": true,
  "command": "scan",
  "data": {
    "framework": "react",
    "styling": ["tailwind", "css"],
    "tailwindConfig": null,
    "cssFiles": [
      { "path": "src/desktop-ui/index.css", "bytes": 42549 },
      { "path": "src/desktop-ui/dana-tokens.css", "bytes": 13971 },
      { "path": "src/desktop-ui/test/__mocks__/empty.css", "bytes": 38 }
    ],
    "htmlFiles": [
      { "path": "plans/reports/260714-1934-dana-ui-responsive-audit/dana-responsive-audit.html", "bytes": 1455077 },
      { "path": "tests/playwright-report/index.html", "bytes": 529576 },
      { "path": "docs/research/renesas-activity-report-v2.html", "bytes": 313224 },
      { "path": "docs/research/Cross-accounts/cross-account-product-signals.html", "bytes": 85936 },
      { "path": "design-review/integrations/prototype.html", "bytes": 60632 }
    ],
    "componentDirs": [
      { "path": "src/desktop-ui/components", "files": 157 }
    ],
    "designMd": null,
    "dsStatus": "present",
    "verdict": "ds-present",
    "truncated": true,
    "visited": 4000
  }
}
```

**Confirms the phase's motivating finding**: `src/desktop-ui` is now in `componentDirs` and
`dana-tokens.css` is in `cssFiles`. Before this phase: `cssFiles: 0, componentDirs: 0`.

**Deviation from the UC-01 Gherkin worth flagging**: the Gherkin's happy path says `truncated is
false` for the "UI buried under an alphabetically-earlier sibling" scenario. Live, `truncated` is
`true` (`visited: 4000`). Root cause, checked directly: dana-desktop's root has a `.venv`
directory (8187 files) that sorts alphabetically *before* `benchmark`, `config`, `docs`, etc., and
is **not** in `SKIP_DIRS` (which only lists `node_modules`, `dist`, `build`, `out`, `coverage`,
`vendor`, `.git`, `.next`, `.turbo`, `.cache`, `.agent`, `.claude`, `design` — no `.venv`). The
whole repo (excluding `SKIP_DIRS`) has ~15,301 entries, so *something* was always going to hit the
4000 cap; BFS's fix is that it reaches `desktop-ui` (shallow) before it works its way deep enough
into `.venv`/`docs`/etc. to exhaust the budget — the honest result is `truncated: true` with the
UI still found, not `truncated: false`. This is not a bug in the implementation (the phase file
explicitly forbids touching `SKIP_DIRS`, Key Insight 3) — it's the Gherkin's illustrative example
undershooting the real repo's shape. Reporting per Art V/the escalation instruction rather than
silently reconciling it.

## LIVE run 2 — EaseUI (evidence only, not pass/fail)

```
$ node dist/cli.js scan --cwd /Users/jang/Products/EaseUI --json
{
  "ok": true,
  "command": "scan",
  "data": {
    "framework": null,
    "styling": ["tailwind", "css"],
    "tailwindConfig": "app/tailwind.config.js",
    "cssFiles": [
      { "path": ".agents/skills/plans-kanban/assets/dashboard.css", "bytes": 31085 },
      { "path": "app/src/app/globals.css", "bytes": 16911 },
      { "path": "frontpage/app/src/app/globals.css", "bytes": 16782 },
      { "path": "app/src/app/docs/docs.css", "bytes": 9382 },
      { "path": "frontpage/app/src/app/docs/docs.css", "bytes": 9382 }
    ],
    "htmlFiles": [
      { "path": "app/public/samples/ui-generation/01-editor.html", "bytes": 56331 },
      { "path": "frontpage/app/public/samples/ui-generation/01-editor.html", "bytes": 56331 },
      { "path": ".agents/skills/skill-creator/eval-viewer/viewer.html", "bytes": 44998 },
      { "path": "awesome-design-md/design-md/hashicorp/preview.html", "bytes": 42158 },
      { "path": "awesome-design-md/design-md/hashicorp/preview-dark.html", "bytes": 41940 }
    ],
    "componentDirs": [
      { "path": "app/src/components/ui", "files": 12 }
    ],
    "designMd": null,
    "dsStatus": "none",
    "verdict": "brownfield-code",
    "truncated": true,
    "visited": 4000
  }
}
```

`framework: null` (no root `package.json`, as expected) yet `verdict: brownfield-code` because
`componentDirs.length > 0` — the verdict logic (Key Insight 6, left untouched) is still right
here. `truncated: true, visited: 4000` — the walk ran out of budget, as expected for a repo this
size (62 nested `package.json`, thousands of files). Only **one** of the two legitimate UI roots
(`app/src/components/ui`) was found in this run; `frontpage/app/src/components` was not reached
before the cap — a live instance of the exact edge case UC-01/D3 names. This is evidence, not a
failure: D3's answer ("scan reports what it finds, stably sorted; it does not need to find
everything") holds — the honest `truncated: true` signal tells `learn.md` (and the user) the map
is partial, which is the whole point of this phase.

## Deviations from plan.md (per phase file's own "Deviations" section)

Confirmed as designed, not introduced by me:
1. OQ1 answered by D3 with neither a flag nor a question — verified live on EaseUI above.
2. The depth cap also sets `truncated` — implemented and covered by
   `test_a_tree_over_max_depth_reports_truncated`.
3. The header comment changed — done, re-worded per Key Insight 1.
