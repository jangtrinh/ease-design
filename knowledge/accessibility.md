# Accessibility — the two-tier model, and why neither tier is a conformance claim

Accessibility is a property of a real person's *experience* of a UI — not a checkbox a tool
can tick. Automated tooling detects a **subset** of barriers; industry estimates put the
machine-detectable share at roughly a third of WCAG success criteria. So the governing rule
here is honesty-first: **ease-design's tools report *violations found*, never that a page is
"accessible" or "compliant".** A clean run means "no defects in the rules we ran" — the
manual residue always remains. This is the same discipline `ui a11y-lint` and `ui ds a11y`
already keep in their own output ("not a conformance claim").

## The division of labour (constitutional)

The `ui` binary is deterministic and **browser-free** — it inspects *source* (token files,
static HTML) but never *renders*. Rendered contrast, computed styles and live ARIA need a
real DOM. So accessibility splits into two tiers, on the same seam as visual-regression:

| Tier | Tool | Sees | Cost | Cadence |
|---|---|---|---|---|
| **1 — static** | `ui a11y-lint`, `ui ds a11y` (kernel) | the *source* AST + declared tokens | free, no browser, deterministic | every build |
| **2 — rendered** | `a11y-audit` (optional workspace, axe-core over live Chrome) | the *computed* DOM | a browser launch | review gates |

Tier 1 is the floor every generation clears. Tier 2 is the deeper pass you run before a
handoff. Neither, alone or together, is a conformance verdict.

## Tier 1 — static (what the kernel proves from source)

- **`ui a11y-lint <file.html>`** — structural / markup WCAG checks over the HTML AST:
  missing `alt` attribute, an icon-only control with no accessible name, missing `lang`,
  a label-less input, a redirect-only stub, and similar *presence/absence* facts the source
  states outright. Precision-first: a finding is a real defect, and a pass is **not** a
  conformance claim.
- **`ui ds a11y`** — token-pair contrast. It checks the **declared** `{role}` /
  `{role}-foreground` pairs at ≥ AA using color math, exactly because the paired *name*
  encodes the intended background (see `token-taxonomy.md` § the paired semantic convention).
  Declared pairs only — not rendered contrast, and not that a screen actually uses the pairs.

**Can prove:** the presence or absence of an attribute/relationship in the source; a declared
token pair's contrast ratio. **Cannot see:** rendered contrast (text over a gradient, an
image, or a computed/inherited/overridden colour); whether focus *order* makes sense; whether
a screen reader can operate the page; alt-text *quality* (it sees the `alt` exists, never
whether it describes the image).

## Tier 2 — rendered (what axe-core adds over a live DOM)

**`a11y-audit <file.html|url> [--tags wcag2a,wcag2aa,wcag21aa] [--json]`** opens each target
in installed Chrome (Playwright `channel:chrome` — no browser download) and runs axe-core
over the **computed** DOM. It catches the classes tier 1 structurally cannot:

- **Computed colour-contrast** — resolved styles, inheritance, cascade overrides, text over a
  background image. The single biggest rendered-only class, and the reason tier 2 exists.
- **ARIA usage in context** — role/attribute validity against the *resolved* accessibility
  tree, required-parent / required-children relationships, name-from-content as rendered.
- **Structural facts that only settle after layout** — orientation locks, duplicate ids in
  the live tree, and the rest of the axe rule set filtered by `--tags`.

Output is the envelope `{ok, command:"a11y-audit", data:{pages:[{target, violations:[{id,
impact, help, helpUrl, nodes, sample}], violationCount, passCount, incompleteCount}],
totals}}`; exit 1 iff any violation. **`incompleteCount` is the "couldn't decide" bucket** —
axe flagged something a human must judge; it is *not* a pass and *not* a violation.

**Still not conformance.** The residue no rendered scan can settle, which a human (or the
curator's adversarial refuter) must still judge:

- **focus-visibility quality** — the ring may *exist* yet be invisible against its surface.
- **reading / focus-order sense** — DOM order can pass every rule and still read nonsensically.
- **alt-text quality** — axe sees the `alt` is present; not whether it conveys the image.
- **motion preferences honoured in practice** — does `prefers-reduced-motion` truly disable
  the animation, or just pass a static check?
- meaningful sequence, plain-language / cognitive load, context-change on focus, and the rest
  of the human-judgment criteria.

## When to run which

- **Tier 1 — every build / every generation.** Free, deterministic, precision-first, so it
  never blocks on flake. `ui audit` runs it per HTML file.
- **Tier 2 — at review gates**, and whenever a change touches computed colour, theming, or
  ARIA. It costs a browser launch, so it is not a per-keystroke check. The umbrella
  `design-os audit` adds an **`axe` section per HTML file when the `a11y-audit` hand is
  present**, and degrades silently (no section) when it is absent — an optional deepening of
  the same report, never a new hard dependency.

## The wording rule (non-negotiable)

Never call a page "accessible" or "compliant". Report what was actually checked:

- clean tier 1 → "no static findings; **not a conformance claim** — rendered/behavioural
  criteria and alt quality need a browser or a human".
- clean tier 2 → "**0 violations found by axe-core `<version>` on the rules run; manual
  criteria remain**".

Both tiers report the *absence of machine-detectable defects in the rules they ran* — never
the *presence of accessibility*. Encode that honesty in every message; a green check that
overclaims is worse than no check, because it stops a human from looking.

## Cross-references

- `token-taxonomy.md` § the paired semantic convention — why `{role}-foreground` makes tier-1
  contrast *deterministic* (declared pairs, not guessed text×surface combinations).
- `figma-craft/curator.md` Axis 2 — the SEE-time quality gate folds **both** tiers into its
  accessibility check (static every pass, rendered at the gate) and treats the manual residue
  above as adversarial-refuter territory.
- `color-science.md` — the WCAG contrast targets and OKLCH math both tiers' contrast checks
  share.
- `visual-regression.md` — the sibling browser-tier floor; same constitutional split (the
  binary reasons over data the host renders).
