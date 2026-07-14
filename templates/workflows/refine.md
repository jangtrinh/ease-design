---
description: "Self-correction pass that fixes execution quality without redesigning. Use when a variant scores low on craft axes or the user asks to polish or clean up a design."
---

## `/ui:refine` — Self-correction pass on the current variant

A focused **execution-quality** pass that fixes visual issues in an existing UI **without
changing its design identity**. Refine never adds features, never re-architects sections,
and never alters the color palette or typography system. It only cleans up how the existing
design is rendered.

Refine is the model's own self-correction loop. It runs up to **2 passes** with
`ui autofix` between passes. It is distinct from — and runs inside — the larger taste-gate
loop in `templates/workflows/critique.md`, which has its own outer pass budget.

## Inputs

- Current variant HTML file path (e.g. `./variant.html`). If the host CLI has an implicit
  "current variant", use that; otherwise ask the user once.
- Generation mode (e.g. `desktop`, `mobile`, `component`) — inherited from the variant's
  metadata or the host session. Used to apply mode-specific guardrails (viewport, no page
  chrome on components, etc.).

No free-text instruction is required: refine is a fixed checklist. If the user typed a
specific request alongside `/ui:refine` ("fix the spacing in the hero"), treat it as a
hint to weight that axis higher, but still run the full checklist.

## Steps

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

1. **Resolve inputs.** Confirm the path to the current variant HTML and the mode. If the
   path is missing, ask the user.

2. **Read the variant.** Load the current HTML into context exactly. Keep the original
   for comparison after each pass.

3. **Set pass budget.** Refine runs **at most 2 passes**. Track `pass = 1, 2` and stop
   early if a pass produces output byte-identical to its input (no remaining issues).

4. **Per-pass loop** — repeat for each pass until the budget is exhausted or an early
   exit fires:

   ### 4a. Apply the 7-point self-correction checklist

   Read the current HTML and identify every issue across these seven axes. The model is
   the auditor; only fix what is actually broken — do not invent issues.

   1. **Layout** — broken layouts, overlapping elements, incorrect flex/grid behaviour,
      missing overflow handling.
   2. **Typography** — wrong font weights, inconsistent font sizes, missing line-heights,
      poor text truncation.
   3. **Spacing** — uneven padding/margins, misaligned elements, inconsistent gap
      values.
   4. **Contrast** — low-contrast text, text that fails on its background, washed-out
      states.
   5. **Alignment** — off-centre elements, misaligned grid items, inconsistent
      border-radius across sibling components.
   6. **Responsive** — content overflowing its container, items that vanish or stack
      wrong at the target viewport.
   7. **Polish** — missing hover states, broken transitions, incomplete animations,
      unfinished interactive affordances.

   On pass 2, prepend a note to the analysis: "this is pass 2 — a previous pass already
   fixed some issues; focus on remaining or newly-introduced ones." Do not re-fix what
   pass 1 already fixed.

   ### 4b. Re-emit the document

   Re-emit a complete HTML document (`<html>`, `<head>`, `<body>`) that fixes every
   identified issue, under these constraints:

   - **Preserve design identity** — same color palette, same typography system, same
     visual language. The viewer should recognise it as the same variant.
   - **Do not redesign the layout** or change the conceptual structure. Fixes are
     execution-quality only.
   - **Do not add new features or sections** — refine is corrective, not generative.
   - **Keep placeholders intact** — `picsum.photos` URLs unchanged.
   - **Keep CDN links intact** — Tailwind, Lucide, Google Fonts.
   - **Honour mode constraints** (read the matching section in
     `knowledge/mode-constraints.md` if unsure): mobile fits a 390 px viewport;
     a component specimen has no page-level chrome (no headers/sidebars/footers); all
     component states stay visible.

   Begin the output with a brief HTML-comment refinement log listing exactly which issues
   were found and fixed in this pass. The log is the only narration; no markdown fences
   around the document.

   Example log skeleton:

   ```
   <!-- AI_REFINEMENT_LOG:
    1. Fixed: <axis> — <specific issue>
    2. Fixed: <axis> — <specific issue>
    ...
   -->
   ```

   Write the new HTML to the variant file path, replacing the previous content.

   ### 4c. Run the deterministic autofixer

   ```bash
   ui autofix <variant.html> --write --json
   ```

   This adds a viewport meta if missing, repairs image `onerror` fallbacks, ensures
   `lucide.createIcons()` is called when Lucide icons appear, normalises CDN URLs, and
   uniques duplicate `id`s. It is idempotent; running it on already-clean HTML is a
   no-op.

   ### 4d. Run the structural linter (deterministic floor)

   Refine re-emits the whole document, and `autofix` does not balance tags — a dropped
   closing tag from a re-emit would otherwise reach critique (and the user) with no
   machine check. Mirror the gate that `iterate.md` and `redesign.md` already run:

   ```bash
   ui validate-layout <variant.html> --json
   ```

   **Hard rule:** if it reports any `error`-severity finding (missing `<html>`/`<body>`,
   unbalanced structural tags), the re-emit corrupted the markup — restore the pre-pass
   copy kept in step 2, re-emit ONCE with the linter's findings appended to the
   checklist analysis, and re-run this check. If the second attempt still trips an
   error, keep the restored pre-pass copy and hand THAT to critique — never forward
   corrupted markup. Warning-severity findings (the layout-smell heuristics) are
   advisory: note them and let the quality gate weigh them.

   **Pre-existing-error exception:** if the *original input* variant (the step-2 copy,
   before any refine pass) already trips the same `error`-severity finding on its first
   check, treat it as a pre-existing condition of the source — do not block the pass on
   it; only NEW structural errors introduced by a re-emit gate the loop.

   ### 4e. Early-exit check

   Compare the post-autofix HTML to the pass's input HTML (trimmed for whitespace at the
   ends). If they are **byte-identical**, the pass made no changes — there is nothing
   left to fix. **Stop the loop** even if pass 2 has not yet run.

5. **Hand off to the quality gate.** When the per-pass loop exits (by budget or by
   early-exit), defer the final verdict to `templates/workflows/critique.md`.

## Outputs

- The variant HTML file at its original path, updated in place.
- A short summary message listing: how many passes ran (1 or 2), whether an early exit
  fired, and a one-line description of the issues fixed (sourced from the
  `AI_REFINEMENT_LOG` comments).
- The HTML-comment refinement log at the top of the file is the durable record of which
  issues were found and fixed.

## Quality gate

Defer to `templates/workflows/critique.md`. A refine pass is only "done" when:

- The file parses as valid HTML with CDN links intact.
- `ui autofix` reports zero findings on a re-run (idempotence proof).
- `ui validate-layout` reports zero `error`-severity findings introduced by refine
  (pre-existing source errors are exempt per step 4d).
- The critique verdict is **pass** across all 7 axes; axes that were not the focus of
  refine must still not regress against the baseline.

If the critique still fails after refine's 2-pass internal budget is spent, refine does
**not** retry on its own — control returns to the outer taste loop, which decides
whether to spend another outer round, call `/ui:iterate` with a targeted change, or
escalate to the user. Refine never widens its scope into iterate or full-regen
territory; it stays a corrective pass.
