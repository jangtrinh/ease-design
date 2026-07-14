# Design Soul — the declared stance

`design/soul.md` is the project's **declared** design stance: a short, owner-ratified
statement of what this design language **never** does, what it **always** holds, and what
**voice** its copy speaks. It is the opposite pole of the design memory: memory is
*learned* (events observed, verdicts recorded, decayed over time), the soul is *declared*
(a human wrote it down and ratified it). Both bias generation; only one is a promise.

## §1 Where it sits — the precedence chain

```
brief  >  soul (declared)  >  memory prior (learned)  >  knowledge floors
```

- The **explicit brief always wins** — a soul biases choices, it never vetoes what the
  user actually asked for.
- The **soul outranks memory**: a learned "this project tends dark-mode" yields to a
  declared "## Never: light backgrounds". Learned taste drifts; declared taste is stable
  until the owner edits it.
- The **knowledge floors** (a11y minimums, mode constraints, `TECHNICAL_RULES`) sit
  below everything but are *non-negotiable* — a soul cannot declare its way out of
  contrast ratios. Precedence orders *taste*, never *safety*.

Every `/ui:*` flow reads the soul FIRST when it exists (it is the `soul` section of
`ui ds context`, so any flow loading DS context receives it automatically). A project
without a soul is fine — absence is never an error anywhere except an explicit
`ui ds soul check`.

## §2 How to write one — short, sharp, measurable

- **Short beats long.** Three sharp clauses beat thirty vague ones; the linter warns
  past 120 lines. A soul that reads like a spec has stopped being a stance.
- **Write clauses a machine could someday check.** "No rounded corners over 4px" and
  "display type ≥ 44px" bind to measurable proxies; "feel premium" binds to nothing.
  Prefer the measurable phrasing even while the check is still a model judgment —
  future overlays can only enforce what was stated crisply.
- **`## Never` is a hard prohibition** — generation must not propose choices that
  violate it. **`## Always` is a standing preference** — express it wherever the brief
  leaves room. **`## Voice`** governs copy tone the same way.
- Keep the frontmatter honest: `status: draft` while unreviewed, `status: ratified`
  once the owner has read and approved every clause. Ratification is the point — an
  unratified soul is a suggestion, not a stance.

## §3 Where a soul comes from

- **Scaffold** — `ds init` writes a placeholder `design/soul.md` (status: draft) beside
  the compiled DS; `ui ds soul init` writes the same scaffold on demand. The owner edits
  it by hand, then ratifies.
- **Extraction** — `/ui:learn` drafts the soul **from measured evidence** after the DS
  compiles: each Never/Always bullet cites what was actually observed
  (`— evidence: 5/5 captured pages use display ≥ 44px`), never imagination. The draft
  stays `status: draft` until the owner reviews, edits, and ratifies. Evidence-cited
  extraction is the honest path for a brownfield project; hand-writing is the honest
  path for a fresh conviction.

## §4 Machine floor — `ui ds soul check`

The linter checks **structure only** — taste stays a model/owner judgment. Six checks:

- `soul-missing-section` *(error)* — a required `## Never` / `## Always` / `## Voice`
  heading is absent.
- `soul-empty-section` *(error)* — a heading exists but holds no real bullet.
- `soul-placeholder-copy` *(error)* — lorem-ipsum or Jane-Doe/Acme filler shipped as
  stance text (shared checks with `ui content-lint`).
- `soul-draft-status` *(warning)* — still `status: draft` (or no status at all).
- `soul-scaffold-untouched` *(warning)* — scaffold placeholder comments still present.
- `soul-too-long` *(warning)* — over 120 lines; short beats long.

Exit 1 on any error. A missing file is the error finding `soul-missing` — invoking the
check explicitly means a soul is expected; everywhere else the soul stays optional.

## §5 Relationship to the other quality layers

- **`page-structures.md` §2 (variety↔conformance)** — that switch asks whether the
  system has *declared itself*. A ratified soul is exactly such a declaration: in
  conformance mode the soul's clauses are part of what pages must share; in variety
  mode a soul narrows the search space without collapsing it to one template.
- **Specificity scoring (page-structures §4, and the curator's spec-fit judgment)** —
  when a soul exists, "specific to this brief" also means "specific to this soul":
  a surface that reads like it could belong to any project fails Specificity even if
  it is technically on-brief.
- **The taste rubric / critique gate** — unchanged. The soul biases what gets
  *proposed*; the gate still scores what got *made*.
