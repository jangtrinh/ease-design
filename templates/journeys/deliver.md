---
description: "Ship a design:os change: run the full-stack audit in the order that actually catches problems (flow, evidence, VR baseline, paired-tokens, rendered a11y, full audit), work the delivery checklist (specimen, docs, preview, vr-matrix, changelog) including the vr-matrix step most agents never discover, know exactly what a static a11y pass does not prove, and hand off the diff/changelog/PR. Use when preparing a release, a PR, a specimen page, or any 'is this ready to ship' question."
---

# Journey: Deliver

Use this when a design or design-system change is about to leave the daily loop and become
a release, a PR, or a shared specimen — the point where "it looks right" has to become
"it's proven right." Every command below was checked against its own `--help` first.

## 1. The ordered full-stack audit — sequence matters, not just the individual commands

Each command below is documented on its own; the **order** across all of them together is
not written down anywhere except a single dogfood report today. Running them out of order
produces misleading results (e.g. gating a VR diff against a baseline captured *after* you
already changed tokens tells you nothing):

1. **Flow first** — author `flow.json` from the real information architecture (screens,
   states, transitions, entry points), then lint it before anything downstream assumes it's
   sound:
   ```bash
   ui flow lint flow.json --json
   ```
   Catches `dangling-ref` / `unreachable-screen` / `dead-end` / `missing-error-state` /
   `invalid-trigger` / `noop-self-loop` / `no-entry` (errors) before they invalidate a
   later audit pass.

2. **Evidence** — record what backs any claim/copy in the delivery, before anything ships:
   ```bash
   ui evidence add --finding "…" --quote "…" --source <file> --dir design --json
   ui evidence verify --dir design --json
   ```
   `verify` re-checks every quote finding against its stored source and fails on any
   fabricated or broken one — run it, don't just add and assume.

3. **VR baseline — capture BEFORE making further changes**, so later diffs measure against
   a known-good state, not a moving target:
   ```bash
   page-shot <pages...> --out <renders-dir>
   ui vr accept <renders-dir> <baseline-dir>
   ```

4. **Paired-tokens** — audit (and fix, additively) the DS's declared token-pair contrast
   before the rendered pass, so obvious static failures don't waste a rendered-tier run:
   ```bash
   ui ds a11y --dir <project> --pairs "text:surface,..." --json
   ```
   Fix findings as **additive** aliases (new tokens/aliases, don't rename what's already
   referenced elsewhere) and re-run until clean.

5. **Rendered a11y** — the tier-2 pass, only meaningful once the pages actually render the
   fixed tokens:
   ```bash
   a11y-audit <pages...> --tags wcag2a,wcag2aa --json
   ```

6. **Full audit** — the final deterministic sweep, composing the whole `ui` linter chain
   over the project:
   ```bash
   design-os audit <project-dir> --dir <project-dir> --json
   ```

## 2. Delivery checklist — specimen → docs → preview → vr-matrix → changelog

The ordering here is implicit today (each command documents itself, not the sequence), and
`design-os vr-matrix` in particular is invisible to an agent that only reads
`knowledge/visual-regression.md` (which covers the kernel-only `ui vr` side):

```bash
ui ds specimen --dir <project> --strict --json      # 1. completeness gaps (missing disabled/empty states) — --strict makes any gap exit 1
ui ds docs --dir <project> --out docs/components.md # 2. regenerate component reference docs from the registry (decay-proof)
ui ds preview --dir <project> --out design/preview/specimen.html   # 3. the self-contained specimen page
design-os vr-matrix --project <project> --accept    # 4a. FIRST run: render every component + accept as baseline
design-os vr-matrix --project <project>             # 4b. every run after: render + gate against that baseline
ui changelog --dir <project> --format markdown       # 5. fold ds.manifest.json's changelog[] (+ any recorded insight events) into readable history
```

`vr-matrix` renders each component (via `page-shot`) and gates with `ui vr gate` under the
hood — baselines and gate renders **must** be produced on the same machine/fonts (cross-
machine antialiasing noise floods the diff); `--max-ratio` is the escape hatch for same-
machine hinting jitter only, not a substitute for matching environments.

## 3. Static vs. rendered a11y — know what static did not prove

Two tiers — static (`ui a11y-lint`, `ui ds a11y`) and rendered (`a11y-audit`). What each
tier can and cannot see is owned by `knowledge/accessibility.md` — it is not repeated
here. What this journey adds is the delivery discipline:

- **Sequencing:** static before rendered — §1's order (paired-tokens at step 4, rendered
  at step 5) is deliberate: a rendered pass is only meaningful once the pages actually
  render the fixed tokens, and a static failure caught first saves the browser run.
- **Ship-guard:** never phrase either tier's clean result to a stakeholder as "accessible"
  or "WCAG AA conformant" — a clean run means "0 violations found on the rules that ran";
  say exactly what was checked, the same way the tools themselves do. The residue neither
  tier settles still needs a human.

## 4. DS diff, changelog, semver, and the PR handoff

```bash
ui ds diff <base-dir> <head-dir> --format pr-comment --base-version <x.y.z>
```

classifies the change (patch/minor/major, visual-breaking or not) between two DS states.
Read `knowledge/versioning-semver.md` for how to interpret the classification — it is not
repeated here. For the end-to-end PR flow (materialize base/head, diff, post the PR
comment, fold the changelog, sync DS docs), follow `knowledge/design-review.md` directly —
it is already a complete, agent-facing procedure; this journey only tells you *when* to
reach for it (right after the ordered audit above is clean and the delivery checklist is
done).

## Handback discipline

**Status:** DONE | DONE_WITH_CONCERNS | BLOCKED · which delivery steps ran (flow / evidence
/ VR baseline / paired-tokens / rendered-a11y / full audit) and their gate results · what
was proven only at the static tier vs. rendered-verified · open questions.
