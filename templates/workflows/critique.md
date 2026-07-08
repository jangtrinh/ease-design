# Workflow: critique

`/ui:critique` — the taste gate every generation must clear. Given one HTML
variant, the active persona DNA, and the loaded Design System context, this
workflow scores the **6 craft axes** (Layout, Typography, Spacing, Motion,
Iconography, Depth/Surface) plus the **7th systems axis** (Consistency). Any
axis below threshold triggers a **targeted refine pass on that axis only** —
not a whole-design re-roll. The loop is bounded: at most **3 critique → refine
rounds** total. If the variant still fails after round 3, the workflow returns
the best revision so far together with the lowest-scoring axis name so the
caller (a generation workflow or the user) can decide how to proceed.

This workflow is the single source of truth for the taste gate. Every other
workflow that emits HTML — `generate`, `redesign`, `refine`, `iterate`,
`from-ref`, `figma`, `slides`, `extract` — defers to it.

## Inputs

- **`<variant-html>`** *(required, path)* — the variant file under critique,
  e.g. `./variant-1-liquid-glass.html`. Must be a complete, self-contained
  `<html>…</html>` document; the workflow reads it from disk, not from
  stdin.

- **`<persona-slug>`** *(required, string)* — the persona whose aesthetic DNA
  the variant was generated against, e.g. `liquid-glass`. Used to load the
  family file from `knowledge/personas/<family>.md` so the critic can grade
  *against the persona's targets* (e.g. an "expressive motion" persona is
  graded against a high Motion target, not a generic mid).

- **`<ds-root>`** *(optional, path, default `./design`)* — root of the
  project's Design System on disk. The Consistency axis loads tokens and
  registered components from this directory. If the project has no DS yet
  (first generation in an empty project), the Consistency axis is **skipped**
  and the verdict is decided on the six craft axes alone — see step 3.

- **`<mode>`** *(optional, string)* — effective generation mode (`mobile`,
  `desktop`, `component`, `slide`, `dashboard`, `app`, `admin`, `ecommerce`).
  Used to apply mode-specific emphases (slides → 1920 × 1080 layout check,
  components → no page chrome, mobile → 390 px viewport). If absent, the
  workflow does not apply mode-specific axis emphases.

- **`<round>`** *(optional, int, default `1`)* — the current round number.
  Callers normally omit this on the first call; the workflow increments it
  internally each time it loops back to refine. Exposed so a caller can
  resume mid-loop after a manual edit.

## Steps

The host model performs the steps below in order. Each step is concrete: a
specific `knowledge/` file to read, a shell-quoted `ui` invocation, or a
narrowly-scoped scoring prompt the model runs against itself. Do not skip
steps.

### Step 1 — Load the rubric and validate inputs

**Validate the `<round>` input first.** The workflow invariant is
`1 ≤ round ≤ 3`. A `<round>` of 0 or negative would loop forever; a `<round>`
of 4+ would short-circuit at step 5 / step 6 incorrectly. If `<round>` falls
outside `1..3`, stop immediately and surface `BAD_ROUND` to the caller — do
not clamp silently, since a caller passing 0 or 5 has a bug the user needs
to see. Defaults (caller omitted the field) resolve to `round = 1` before
this check runs.

Read **`knowledge/taste-rubric.md`** once. The rubric defines every axis, the
low/mid/high descriptors, the 0–10 scoring criteria, and the "score against"
questions used in step 2. Do not duplicate any of that content into this
workflow — read it.

Resolve `<family>` from `<persona-slug>` via the lookup table in
**`knowledge/persona-index.md`** — its persona table records each slug's
family (e.g. `liquid-glass` → `material-surface`). If the slug is absent
from that table, stop immediately and surface `PERSONA_NOT_FOUND` to the
caller — the critic cannot grade against an unknown persona's targets.

Read **`knowledge/personas/<family>.md`** for the resolved family. The
persona DNA is what supplies the **axis targets**: some personas target
*high Motion*, others *low Motion*; some target *airy spacing*, others
*dense*. A variant is graded against the target the persona asks for, not
against a single fixed setpoint.

### Step 2 — Run the deterministic taste floor, then score the 6 craft axes

**First, run the deterministic taste linter** — the machine-checkable floor
under the model's self-scoring. It catches unambiguous rubric breaches the
model might score leniently or miss:

```sh
ui taste-lint <variant-html> --tokens design/design.tokens.json --json
```

(Omit `--tokens` if the project has no DS yet — the Consistency check then
self-skips.) The JSON envelope returns `findings` (each tagged with its
`axis`) and `axesAffected`. **Binding rule: any axis listed in `axesAffected`
is capped below the pass threshold — it CANNOT be scored ≥ 7 in this round
regardless of the model's qualitative read.** A linter finding is a definite
violation (body < 16px, off-grid spacing, two icon families, pure-black
shadow, linear easing, `transition: all`, or an off-palette hex), not a
matter of taste. Fold each finding into that axis's refine directive in
step 5. The linter is precision-tuned (it only flags certainties), so a clean
run does **not** imply an axis passes — the model still scores qualitatively
below.

Then, for each of the six craft axes — **Layout, Typography, Spacing, Motion,
Iconography, Depth/Surface** — produce one short paragraph with:

1. **What to look at** in the rendered HTML for that axis (use the
   "Controls" line from the rubric and the persona DNA's matching section).
2. **What the persona's DNA implies** for the target on that axis (low /
   mid / high, plus any specific numerics the family file gives — type
   ratio, base spacing unit, shadow ramp shape).
3. **The 0–10 score** with a one-line justification grounded in the
   rubric's per-axis scoring table.

Use the rubric's exact "Score against" questions (last paragraph of each
axis section) as the scoring checklist — not invented heuristics. If a
question's answer is clearly *yes* per the rendered markup, that axis
trends toward 7+; clear *no* drags it below 7.

Apply mode-specific emphases when `<mode>` is supplied:

| Mode | Extra emphasis on … |
|---|---|
| `slide` | Layout (viewport is 1920 × 1080; content fills it, nothing clipped); Typography (display ≥ 48 px, body ≥ 18 px); Consistency (palette and family match prior slides in the deck). |
| `component` | Layout (no page-level chrome — no header / sidebar / footer); Iconography (all states visible if the component has states). |
| `mobile` | Layout (390 px viewport, no horizontal scroll); Spacing (touch targets ≥ 44 px). |
| `dashboard`, `admin` | Spacing (target is dense / "cockpit"); Depth/Surface (target is flat); Typography (tight scale). |

Modes not listed (`desktop`, `app`, `ecommerce`) apply no extra emphasis —
the 6 craft axes carry default weight as defined in `taste-rubric.md`, and
the persona DNA supplies whatever directional bias is appropriate.

Do not invent new axes. The rubric has six craft axes plus Consistency;
that is the full set.

### Step 3 — Score the 7th Consistency axis

The Consistency axis grades the variant against the *project*, not against
itself. Skip this axis only when the project has no Design System on disk
yet — in that case the seven-axis verdict collapses to the six craft axes
and the step-7 result sets `consistencyScored: false` so the caller can
tell scored-low apart from not-scored.

Otherwise, run:

```sh
ui registry list --json
ui ds context --strict --format json
```

`ui ds context --strict` verifies the manifest hash against the on-disk
tokens + registry; if it exits `DS_TAMPERED`, surface the error and stop.
`--format json` gives a structured token + component shape the model can
diff against the variant's markup deterministically.

Read **`knowledge/token-taxonomy.md`** once to remind the critic what counts
as a properly-aliased token (semantic name pointing at a primitive — see
the two-tier model). Then check the variant's HTML against three sub-checks:

1. **Token reuse** — every color, spacing, type, radius, and shadow value
   in the variant resolves to a DS token. Raw `#3b82f6`, raw `16px`, raw
   `Inter, sans-serif` literals when the project already defines
   `color-primary`, `space-4`, `font-family-sans` are violations. Tailwind
   arbitrary-value utilities (`bg-[#1a1614]`, `mt-[3px]`) count as raw
   literals when an equivalent token exists.
2. **Component reuse** — every reusable shape in the variant (button, card,
   input, nav item, hero pattern) matches a record in
   `ui registry list --json`. Inline re-implementations of a registered
   component — slightly different markup, same visual role — are
   violations.
3. **Canonical naming** — every component class / variant name used in the
   variant matches the canonical `Category/Variant` recorded in the
   registry. `cta-btn` when the registry calls it `Button/Primary` is a
   violation; so is mixing `primary-button` and `cta-btn` for the same
   role within one variant.

Score Consistency 0–10 using the rubric's Consistency scoring table. The
output of this step also includes a flat list of violations (each:
`{ kind: "token" | "component" | "naming", offender: "<literal-or-name>",
expected: "<token-or-component-name>" }`). The refine routing in step 5
uses this list when the failing axis is Consistency.

### Step 4 — Aggregate the verdict

Collect all axis scores into one map:

```
{ Layout, Typography, Spacing, Motion, Iconography, Depth/Surface, Consistency }
```

The default pass threshold is **≥ 7 / 10 on every axis** (see
`knowledge/taste-rubric.md` § "The Critique Gate").

- If **every applicable axis ≥ 7**, the variant **passes**. Skip to step 7
  and return a `pass: true` result.
- Otherwise, identify the **lowest-scoring axis** (ties broken by the
  rubric's listed order — Layout > Typography > Spacing > Motion >
  Iconography > Depth/Surface > Consistency, i.e. the first-listed axis
  among ties is the one returned). That axis is what the next refine pass
  targets.

A brief may raise the threshold (e.g. `≥ 8` for a flagship marketing page)
or mark a single axis not-applicable (e.g. Iconography for a UI with no
icons). It must not be silently lowered.

**Excellence tier (opt-in, brief-driven).** When the brief demands
ship-grade output ("excellence", a flagship/public surface, or scoring
against named products), apply `knowledge/taste-rubric.md` § "The
Excellence Tier" on top of this gate:

1. **Correctness gate before any score** — `ui validate-layout` zero
   error-severity findings, `ui taste-lint` zero findings (fix-first, not
   axis-cap), `ui autofix` re-run a no-op, Consistency work list empty.
   Any failure → NO SCORE this round; fix, then score.
2. **Adversarial judging** — score in a fresh context (a judge subagent on
   runtimes that have them; otherwise an explicit refute-first stance with
   cited evidence per axis). The maker never grades its own work.
3. **Reference duel** — duel the variant against the 1–2 nearest
   `knowledge/benchmarks/*.dna.json` captures on measurable traits;
   a lost trait routes its axis back through refine with the DNA value as
   the target bar.
4. **Excellence round** — on a pass, run one extra targeted refine pushing
   the weakest passing axis toward 9 before returning.

The excellence protocols consume rounds from the same ≤ 3-round cap — they
change what a round checks, not how many rounds exist.

### Step 5 — Refine the failing axis (bounded loop)

If the variant failed and `round < 3`:

1. **Re-prompt only the failing axis.** The host model takes the variant's
   current HTML and emits a revised version that fixes *only* the failing
   axis. The other axes are explicitly preserved — the design identity,
   palette, layout, copy do not change unless the failing axis itself
   demands it.

   The targeted prompt skeleton (XML tags separate instructions from the
   large pasted data blocks — do not rename them):

   ```
   <role>
   You are revising one specific axis of an existing UI variant.
   The other axes are passing — do not touch them.
   </role>

   <variant_html>
   {current variant HTML, verbatim — including its accumulated leading
   AI_CRITIQUE_LOG comments, which are the round history}
   </variant_html>

   <persona_dna slug="{persona-slug}" family="{family}">
   {persona DNA from step 1}
   </persona_dna>

   <failing_axis name="{axis-name}" score="{n}/10" target="≥ 7" />

   <what_to_fix>
   {axis-specific directive from the table below}
   </what_to_fix>

   <prior_attempts axis="{axis-name}">
   {ONE line per earlier round that targeted THIS axis, read from the
   accumulated AI_CRITIQUE_LOG blocks at the top of the variant:
   "round {N}: {change summary} → {prev}/10 → {post}/10".
   Omit this tag entirely when no earlier round targeted this axis.}
   These attempts did not clear the bar. Do NOT re-apply any of them —
   pull a different lever on the same axis.
   </prior_attempts>

   <constraints>
   - Preserve design identity: same palette, same typography system,
     same overall composition, same content. The viewer should recognise
     it as the same variant.
   - Touch only what the failing axis requires.
   - Honour the persona's target on the failing axis (low / mid / high
     per its DNA), not a generic mid.
   - Standard Tailwind utilities only. Arbitrary-value utilities
     (`bg-[#1a1614]`, `mt-[3px]`) are permitted ONLY when no equivalent
     DS token exists for that value. Before reaching for an arbitrary
     value, the model must check `ui ds context --strict --format json`
     for a matching token and use the token-backed utility if one is
     found — otherwise the Consistency axis will flag the arbitrary
     value as a raw literal and the loop will ping-pong.
   - Keep CDN links, image `onerror` fallbacks, and Lucide init intact.
   </constraints>

   <output_format>
   Return RAW HTML only — a complete `<html>…</html>` document that
   begins with the accumulated `<!-- AI_CRITIQUE_LOG -->` comments; no
   markdown fences, no commentary.
   </output_format>
   ```

2. **Per-axis directives** for the `<what_to_fix>` slot:

   | Failing axis | Targeted directive |
   |---|---|
   | **Layout** | Strengthen the composition. Establish a single clear focal point per viewport; vary section pacing; let whitespace do work. Match the persona's variance target (strict / mixed / asymmetric editorial). |
   | **Typography** | Re-fit the scale on one modular ratio matching the persona (≈1.15–1.2 utility, ≈1.25 default, ≈1.333–1.5 expressive). Restore weight contrast between body and headings, tighten display tracking (~−0.02em), open body leading (~1.5–1.6). Body never below 16 px. |
   | **Spacing** | Re-quantise every gap and pad onto one base unit (commonly 4 or 8 px). Make inner padding ≥ outer margin in nested containers. Scale section gaps to the persona's density target (dense → tight, airy → generous). |
   | **Motion** | Set easing per direction (ease-out for enter, ease-in for exit, never linear). Bring routine UI transitions to ~150–250 ms. Stagger lists. Animate only `transform`/`opacity`. Add a `prefers-reduced-motion` fallback. Match the persona's motion target. When the fix requires changing motion *technology* (not just values), consult the ladder in `knowledge/motion-craft.md`; never exceed the persona's tier cap. |
   | **Iconography** | Collapse to one icon family. Unify stroke weight. Snap sizes onto a small ramp (16 / 20 / 24 px). Optically align icons to adjacent text cap-height. If line and solid both appear, make the variation encode meaning (e.g. solid = active). |
   | **Depth/Surface** | Replace per-element one-off shadows with a fixed elevation ramp mapped to roles (flat → card → raised → overlay → modal). Make higher steps softer and more diffuse, not just darker; tint shadows toward the background hue. Never stack shadow and a heavy border. |
   | **Consistency** | Replace every flagged literal with the expected DS token; swap every flagged inline component for the registered one; rename every flagged class to its canonical `Category/Variant`. Use the violation list emitted by step 3 as the work list. |

3. **Snapshot the previous round before overwriting.** Before writing the
   revised HTML, copy the current variant file to a per-round backup at
   `<variant>.r<N>.bak` where `<N>` is the round number that *produced*
   that file (i.e. the round about to be replaced — so round 2 saves the
   round-1 output as `<variant>.r1.bak`, round 3 saves the round-2 output
   as `<variant>.r2.bak`). The first revision in round 1 snapshots the
   caller's original input as `<variant>.r0.bak`. These backups are what
   the step-6 tiebreaker compares; without them, the "best so far"
   guarantee is unprovable.

4. **Write the revised HTML** to the variant file path, replacing the
   previous content. **Prepend** this round's critique-log block ABOVE any
   earlier rounds' blocks — accumulate, newest first, never replace. The
   accumulated history is the episodic memory that fills
   `<prior_attempts>` in later rounds, so a round-3 refine can see what
   rounds 1–2 already tried on the same axis and not re-apply a rejected
   fix. Each block records: which axis was targeted, the previous and
   target scores, a one-line summary of the change, and (after step 5.5
   runs) a single line summarising the autofix findings applied this
   round. Keep each block to the four lines below — the history must stay
   cheap to carry. No markdown fences around the document. Skeleton:

   ```
   <!-- AI_CRITIQUE_LOG round=<N>:
    targeted: <axis> (was <prev>/10, target ≥ 7)
    change:   <one-line summary>
    autofix:  <count> findings applied: <viewport-meta, img-onerror, ...>
   -->
   ```

5. **Run the deterministic autofixer** between rounds and capture its
   findings:

   ```sh
   ui autofix <variant-html> --write --json
   ```

   The `--json` envelope reports every finding (viewport meta added,
   image `onerror` fallbacks repaired, `lucide.createIcons()` inserted,
   CDN URLs normalised, duplicate `id`s uniqued). Idempotent: re-running
   on already-clean HTML is a no-op. Take the findings list from the
   envelope and write the `autofix:` line into the round's
   `AI_CRITIQUE_LOG` so the durable record explains every source of
   change between rounds — not just the model's targeted edit.

6. **Increment `round` and loop back to step 2** to re-score. The
   previously failing axis must reach ≥ 7 for the verdict to flip; other
   axes are re-checked too because a fix can regress untouched axes (rare,
   but possible) — a passing variant must not regress any axis below 7
   to claim pass.

### Step 6 — Hit the hard cap

If the variant failed and `round == 3`, **stop the loop**. Three rounds is
the ceiling; do not run a fourth.

**Pick the best revision across all rounds** using the per-round backups
saved in step 5/3 (`<variant>.r0.bak` … `<variant>.r2.bak`) plus the current
round-3 HTML. The comparison key is the score map each round produced:

1. **Primary key — highest minimum axis score.** The round whose
   *lowest-scoring axis* is highest wins. This rewards even, broad
   competence over a peak-and-trough profile.
2. **Tiebreaker 1 — highest sum of all axis scores.** If two rounds tie on
   the minimum (e.g. round 1 floors at Motion = 5, round 2 floors at
   Layout = 5), the round with the larger total wins.
3. **Tiebreaker 2 — most recent round.** If still tied after sum, the
   later round wins — the targeted refines accumulated more information.

Copy the winning round's HTML to the canonical variant path (overwriting
whatever round 3 happened to leave there). Leave the `.r<N>.bak` files
in place — they are the audit trail for why the chosen revision won.

Emit a one-line surfacing message to the caller and to the user, naming
the round chosen, the lowest-scoring axis, and its score:

```
critique cap reached after 3 rounds · best=r<N> · lowest axis: <axis> (<score>/10)
```

The caller decides what to do next: accept the variant as-is, re-roll with
a different persona, call `/ui:iterate` with a vibe word that maps to the
failing axis (see the mapping section below), or escalate to the user. The
critique workflow itself does not retry beyond round 3.

### Step 7 — Return a structured result

Emit a single JSON object to scratch state with the shape below. Generation
workflows (`generate`, `redesign`, `from-ref`, `figma`, `slides`, `extract`)
consume it; the per-variant status line they print is derived from it.

```json
{
  "pass": true,
  "round": 1,
  "consistencyScored": true,
  "scores": {
    "Layout": 8,
    "Typography": 9,
    "Spacing": 8,
    "Motion": 7,
    "Iconography": 8,
    "Depth/Surface": 7,
    "Consistency": 9
  },
  "lowestAxis": "Motion",
  "suggestions": [
    "Stagger the feature-grid entrance by ~40ms per item to push Motion above 8."
  ],
  "html": "./variant-1-liquid-glass.html"
}
```

Field contract:

- **`pass`** — `true` iff every applicable axis ≥ 7.
- **`round`** — the round number on which the workflow exited (1, 2, or 3).
- **`consistencyScored`** — boolean, **always present**. `true` when the
  project has a DS on disk and the Consistency axis was graded; `false`
  when the project has no DS yet and Consistency was skipped. Callers
  use this to distinguish "Consistency scored 8" from "Consistency was
  not scored at all" without inferring from a missing key.
- **`scores`** — the seven axis scores when `consistencyScored: true`;
  the six craft axis scores (Consistency key omitted) when
  `consistencyScored: false`. Never partial — every applicable axis is
  always present.
- **`lowestAxis`** — the lowest-scoring axis name (the rubric's exact axis
  label). Present on both pass and fail; on pass it points at the
  *weakest passing axis* so a caller running `/ui:refine` knows where the
  next targeted polish would go.
- **`suggestions`** — short, axis-anchored sentences (≤ 3 items). On pass,
  optional polish suggestions; on fail, the concrete fixes the next caller
  (user or refine workflow) should apply.
- **`html`** — the path to the final variant HTML on disk (the winning
  round, per the step-6 tiebreaker on a cap-hit; the most recent passing
  round otherwise).

Callers may also receive an additional `violations` field when the
Consistency axis was scored — the flat list from step 3 — so the consuming
workflow can register missing components or surface unresolved tokens to
the user.

Do NOT read or write design memory here — critique stays craft-only (memory must never bias the score). The caller (e.g. generate.md Step 6) records the `taste_verdict`.

## Outputs

- The variant HTML file at its input path, updated in place. On a pass,
  this is the most recent round's HTML; on a cap-hit, this is the
  winning round selected by the step-6 tiebreaker (which may be an
  earlier round).
- Per-round backups `<variant>.r<N>.bak` for every round that fired,
  including `<variant>.r0.bak` for the caller's original input. These
  are the audit trail behind the step-6 best-of selection and remain on
  disk after the workflow exits.
- A structured JSON result (the step-7 shape) returned to the calling
  workflow's scratch state.
- An HTML-comment `AI_CRITIQUE_LOG` at the top of the variant for every
  round that fired, listing the targeted axis, the before / after
  scores, and the autofix findings applied — the durable record of why
  the file looks the way it does.

No files are written outside the variant path and its sibling
`.r<N>.bak` backups. No network calls. No model calls outside the host
model's own scoring.

## Vibe-words → axis mapping

The user-facing entry points `/ui:iterate` and `/ui:refine` take natural
language ("warmer", "bigger text", "less fluffy"). This table maps common
phrases to the axis (or axes) the request actually targets, so an iterate or
refine pass can route the edit through the same axis machinery this workflow
uses for scoring. When a phrase touches two axes, the **primary** axis is
listed first; the secondary axis is the one most often affected as a
side-effect.

| Vibe phrase | Primary axis | Secondary axis (often) |
|---|---|---|
| "warmer" | Depth/Surface (palette warmth, shadow tint) | — |
| "cooler" | Depth/Surface | — |
| "cleaner" | Layout (reduce visual noise, sharpen hierarchy) | Spacing |
| "more refined" | Typography (scale + tracking + leading polish) | Depth/Surface |
| "bigger text" | Typography | — |
| "smaller text" | Typography | Spacing |
| "more airy" | Spacing (raise base / section gaps) | Layout |
| "more breathing room" | Spacing | Layout |
| "less dense" | Spacing | Typography |
| "denser" / "more compact" | Spacing | Typography |
| "more energetic" | Motion | Layout |
| "more dynamic" | Motion | Layout |
| "more playful" | Motion | Iconography |
| "calmer" / "quieter" | Motion (reduce / shorten) | Depth/Surface |
| "less fluffy" | Layout (cut decorative chrome) | Depth/Surface |
| "more editorial" | Layout (asymmetric composition) | Typography |
| "more premium" | Depth/Surface (richer materials, glass) | Typography |
| "more modern" | Layout | Depth/Surface |
| "more grounded" | Depth/Surface (heavier elevation, firmer surfaces) | Spacing |
| "more crisp" | Depth/Surface (flatter, hairline borders) | Typography |
| "more cohesive" | Consistency (token + component reuse) | Iconography |
| "icons feel off" | Iconography | — |
| "shadows look wrong" | Depth/Surface | — |
| "feels generic" | Layout | Typography |
| "feels like a template" | Layout (raise variance) | Depth/Surface |
| "doesn't match the rest of the app" | Consistency | — |

When a vibe phrase is ambiguous (e.g. "make it pop" could touch Layout,
Typography, or Depth/Surface), the caller asks the user one clarifying
question — what specifically feels flat? — rather than guessing. The
mapping above only covers phrases with a single clear primary axis.

## Quality gate

This workflow **is** the quality gate. There is nothing downstream of it; it
is the floor every other workflow defers to. Its own self-check:

- The seven axis scores it returns must be integers in `0..10`.
- Every score must be paired with a short justification grounded in the
  rubric's "Score against" questions.
- The verdict must be deterministic given the same HTML, persona DNA, and
  DS context — re-running critique on an unchanged file must produce the
  same scores. The `ui taste-lint` floor (step 2) is fully deterministic and
  is the part of the gate that does not depend on model judgment: a variant
  that trips a linter finding fails the corresponding axis every time,
  reproducibly.
- The loop must terminate. Round counter is enforced at 3.
- A passing verdict must not silently regress any axis below 7 — every
  axis is re-scored each round, not just the targeted one.
- When the project has no DS yet, Consistency is skipped and the result
  sets `consistencyScored: false` (a field that is always present); the
  verdict is *not* lowered to account for the missing axis.

If any of these invariants is violated, the critic surfaces the breach to
the caller as a workflow error rather than emitting a fake verdict.
