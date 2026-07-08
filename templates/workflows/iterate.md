---
description: "Apply a focused vibe-word edit to an existing variant. Use when the user asks to tweak, adjust, or nudge a generated design without redesigning it."
---

## `/ui:iterate` — Surgical edit of an existing variant

Apply a focused change to a UI that already exists, **preserving its design identity** (color
palette, typography, shadows, corner radii, spacing logic). The workflow routes the edit
through one of three strategies — picked by the `ui edit-strategy` binary — so the cheapest
viable path is used for each request.

The three strategies, ordered by cost:

1. **deterministic** — pattern-matchable swap (e.g. "change the bg to slate-900",
   `change the title to "Pricing"`). No model edit needed for the swap itself.
2. **ln_diff** — model produces a small line-number diff; the `ui edit-strategy apply`
   binary applies it deterministically. Default path for moderate edits.
3. **full_regen** — full re-emission of the HTML. Used only when the request signals a
   structural change ("redesign", "rebuild", "completely", "from scratch", "new layout").

Strategy choice is **routed deterministically by the binary**, not by the model. The model
never picks the strategy itself — it executes the strategy the binary returned.

## Inputs

- `<change-request>` — free-text instruction from the user (the argument to `/ui:iterate`).
- Current variant HTML file path (e.g. `./variant.html`). If the host CLI has an
  implicit "current variant", use that; otherwise ask the user once.
- Generation mode (e.g. `desktop`, `mobile`, `component`) — inherited from the variant's
  metadata or the host session. Used only to apply mode-specific guardrails during a
  full-regen.

## Steps

1. **Resolve inputs.** Confirm the path to the current variant HTML and the change request
   string. If either is missing, ask the user — do not guess.

2. **Read the variant.** Load the current HTML into context. Do not paraphrase it; keep
   the exact bytes for line-accurate edits later.

3. **Classify the request.** Run:

   ```bash
   ui edit-strategy select "<change-request>" --json
   ```

   Read the `strategy` field from the JSON envelope. It will be exactly one of
   `deterministic`, `ln_diff`, `full_regen`. Do not second-guess it.

4. **Execute the chosen strategy** — exactly one branch:

   ### 4a. `deterministic` branch

   The request is a simple color/text swap. The model performs the swap directly on the
   in-memory HTML — a single token or string replacement — and writes the result back to
   the same file path. No diff round-trip is needed.

   - For a color swap: locate every usage of the old color token (Tailwind class, CSS
     variable, or hex literal) and replace it with the new one. Replace **all** occurrences
     of the targeted token; do not partially update.
   - For a text swap: locate the exact heading/title/label text quoted in the request and
     replace it with the requested text. Do not touch surrounding markup.
   - Preserve indentation, attribute order, and whitespace. The diff against the original
     should be the smallest possible edit.

   ### 4b. `ln_diff` branch

   Moderate edit. The model produces a line-number diff; the binary applies it.

   1. Produce a line-numbered view of the source so the model can reference exact line
      ranges:

      ```bash
      ui edit-strategy number-lines <variant.html> > /tmp/variant.numbered.txt
      ```

      Each line is prefixed with a right-aligned `<n>| ` marker. Read this view.

   2. Emit a line-number diff that **only touches lines that must change**. The wire
      format:

      ```
      @@ line <start>[-<end>] @@
      - <old line>
      + <new line>
        <context line>
      ```

      Rules:
      - `<start>` and `<end>` refer to line numbers in the numbered view (1-indexed,
        inclusive).
      - `-` lines are the original lines verbatim (no line-number prefix).
      - `+` lines are the replacement.
      - `  ` (two-space prefix) lines are unchanged context that must match exactly. Keep
        context tight — one or two lines on each side of a change is enough.
      - Emit multiple `@@` chunks if the change spans non-contiguous regions.
      - Do **not** wrap the diff in code fences when handing it to the binary; pipe raw.

   3. Apply the diff with the binary:

      ```bash
      printf '%s' "<diff>" | ui edit-strategy apply <variant.html> --diff - --write --json
      ```

      Read the JSON envelope. Two failure modes to handle:

      - `BAD_DIFF` — zero chunks parsed; the diff was malformed. Re-emit the diff,
        paying attention to the exact `@@ line N-M @@` header and the `- / + /   `
        prefixes.
      - `DIFF_NO_MATCH` — one or more chunks matched no lines within ±5 (the source
        moved since the diff was produced, or the `-` lines were paraphrased). The
        envelope's `data.unmatched[]` is a per-chunk diagnostic: the quoted `-` lines
        the binary looked for, the nearest window where a trimmed match *does* exist
        (with its line number), and which matching rule failed. **Repair the diff
        EXACTLY ONCE using that diagnostic** — re-target each unmatched chunk to the
        reported nearest window and copy the `-` lines verbatim from the numbered
        view (the file was not modified on failure, so the numbered view from
        substep 1 is still valid; do not re-run `number-lines`). Chunks that DID
        match must be re-sent too — apply is all-or-nothing. Re-apply with the same
        command. If the repaired diff fails again for ANY reason, fall through to
        step 4c (full regen — the identity-risky path this one repair attempt
        exists to avoid). Never attempt a second repair.

      On success the binary writes the patched HTML in place and reports
      `chunksApplied`.

   ### 4c. `full_regen` branch

   Structural change, **or** ln_diff fell back. The model re-emits the entire HTML
   document.

   1. Read `knowledge/mode-constraints.md` (the section for the current mode) so the
      guardrails for viewport, scope, and CDN usage are fresh.
   2. Re-emit a complete HTML document (`<html>`, `<head>`, `<body>`) that:
      - **Preserves design identity** — same color palette, typography scale, shadow/
        radius tokens, spacing rhythm. Identity is what makes the variant recognisable;
        do not redesign it under the cover of "iterating".
      - **Applies the requested change in full** — including any structural moves the
        request implies.
      - **Keeps placeholders intact** — `picsum.photos` URLs, CDN links (Tailwind,
        Lucide, Google Fonts) stay exactly as they were unless the request explicitly
        targets them.
      - **Honours mode constraints** — e.g. mobile fits a 390 px viewport; a component
        specimen has no page chrome.
   3. Begin the output with a brief HTML-comment reasoning block (3–6 lines) listing
      edit scope and what was deliberately preserved. The comment is the only narration;
      no markdown fences around the document.
   4. Write the new HTML to the variant file path, replacing the previous content.

5. **Run the deterministic autofixer.** Regardless of branch:

   ```bash
   ui autofix <variant.html> --write --json
   ```

   This adds a viewport meta if missing, repairs image `onerror` fallbacks, ensures
   `lucide.createIcons()` is called when Lucide icons appear, normalises CDN URLs, and
   uniques duplicate `id`s. It is idempotent — running it twice is a no-op.

6. **Run the structural linter.** Before the (model-judged) quality gate, run the
   deterministic structural check on the edited file:

   ```bash
   ui validate-layout <variant.html> --json
   ```

   This catches structural breakage a surgical edit can introduce — unbalanced or
   orphaned tags, broken nesting, overflow smells. **Hard rule:** if it reports any
   `error`-severity finding (the 3 structural checks), the edit corrupted the markup —
   discard it and re-run this pass as `full_regen` (the safe path that always produces
   valid HTML). Layout smells (the 7 heuristics) are advisory: note them and let the
   quality gate weigh them. This mirrors `redesign.md`; it exists because a malformed
   ln_diff splice would otherwise reach the user with no machine check.

7. **Run the quality gate.** Hand the patched file to `templates/workflows/critique.md`.
   The critique returns a per-axis score plus a verdict. If the verdict is **fail**, fold
   the critique's recommended fixes into the next iterate pass — but never loop forever:
   the critique's own pass budget is the hard ceiling.

## Outputs

- The variant HTML file at its original path, updated in place.
- A short summary message for the user listing: which strategy ran, how many chunks were
  applied (ln_diff only), and the critique verdict.
- For `full_regen`: the HTML-comment reasoning block at the top of the file is the
  durable record of what changed and why.

## Quality gate

Defer to `templates/workflows/critique.md`. An iterate pass is only "done" when:

- The file parses as valid HTML with CDN links intact.
- `ui autofix` reports zero findings on a re-run (idempotence proof).
- The critique verdict is **pass** on every axis the change touched; axes the change did
  not touch are graded against the previous variant's baseline (a passing variant must
  not regress untouched axes).

If the verdict fails on an untouched axis, the model has drifted the design identity —
revert and either re-run with tighter constraints or escalate to `full_regen` with the
identity guardrails called out explicitly.
