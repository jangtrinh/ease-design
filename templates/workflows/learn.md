---
description: "Teach ease-design an existing project's design system — scan the repo, harvest tokens/components/interaction states from real evidence, and compile the DS so generation matches the product. Use when initializing ease-design on a project that already has UI, or to re-learn after a major redesign."
---

# Workflow: learn

`/ui:learn` — the **brownfield on-ramp**. When a project already has UI — a
React/Vue/Svelte codebase, a hand-coded HTML page, a live site, or a Figma
file — this workflow teaches ease-design *that product's own* design language
instead of compiling a persona-default one. It scans the repo, asks a single
question about the source of truth, routes to the matching extraction flow, and
leaves a compiled Design System so the next `/ui:generate` produces variants
that pass the Consistency axis against the *user's* system — never a generic
default.

North-star: the user supplies *what* (which existing UI to learn from); the
system supplies *how* (which files to sample, which values are trustworthy, how
to compile). Never make the user hand-pick tokens or components.

## Inputs

- **No positional required.** The workflow discovers everything from the project
  on disk via `ui scan`.
- **`--cwd <path>`** *(optional)* — project directory to learn from (default: the
  current working directory), forwarded to `ui scan`.
- The user's **one** answer in step 2 (the source of truth) is the only decision
  they make.

## Steps

### Step 1 — Scan the project

Run the deterministic scanner and read its verdict:

```sh
ui scan --json
```

The envelope's `data` carries `framework`, `styling`, `tailwindConfig`,
`cssFiles`, `htmlFiles`, `componentDirs`, `designMd`, `dsStatus`, and a
`verdict`. Summarise the findings for the user in **one short paragraph** — the
framework, the styling approach, how many component dirs / HTML files were seen,
and the verdict — not a raw dump.

If `verdict` is already `ds-present`, tell the user a compiled DS exists and stop
unless they explicitly want to re-learn (e.g. after a major redesign);
re-learning replaces the system via `--force` inside the routed flow.

### Step 2 — Ask ONE question (source of truth)

Ask the user a **single** question with exactly four options — never more than
this one question:

1. **Learn from code** *(default when the verdict is `brownfield-code`)* —
   harvest the design system from the repo's own components and styles.
2. **Learn from a live URL** — capture a deployed page's real computed styles.
3. **Learn from a Figma file** — reproduce a frame as HTML, then extract from it.
4. **Start fresh with a persona** — nothing existing is worth keeping; compile a
   new system from scratch.

Preselect the default from the scan verdict but let the user override. Do NOT
ask follow-up questions about tokens, colours, spacing, or components — the
routed flow derives all of that from evidence.

### Step 3 — Route to the matching flow

Follow the flow for the chosen source; **do not** restate its steps here.

- **Code** → follow `templates/workflows/extract.md` against the representative
  files chosen in step 3a.
- **URL** → follow `templates/workflows/from-url.md` with the user's URL.
- **Figma** → follow `templates/workflows/figma.md` to produce HTML, then feed
  that HTML into `templates/workflows/extract.md`.
- **Fresh** → stop and tell the user to run `/ui:generate "<their idea>"`; the
  Design System compiles there (generate.md step 3, Branch A). `/ui:learn` has
  nothing to extract in this case.

#### Step 3a — Representative sampling (never learn from one file)

A design system inferred from a single page or component is a caricature of the
product. Using the scan's `componentDirs`, `htmlFiles`, and `cssFiles`, select
**3–5 files that cover distinct surfaces** — a landing/marketing surface, a
dense application screen, and a form/settings screen where each exists. Prefer
the largest file per surface (it carries the most tokens) and the component
directories with the most files. State plainly which files you sampled and which
you skipped, so the coverage is auditable. For the URL and Figma routes, apply
the same doctrine to pages/frames: sample 3–5 representative screens, not just
the homepage.

#### Step 3b — Interaction-state evidence

Harvest interaction states (`:hover` / `:focus` / `:active`) and motion
(`transition` / `animation`) from the sampled sources, and record a one-line
Motion identity note — following the **"Interaction-state evidence"** section of
`templates/workflows/extract.md` (canonical). Register only states you actually
observed via `ui registry register … --states <observed>`; never invent one.

#### Step 3c — Evidence grade (SOURCE-grade only)

Admit only values that trace to deterministic extraction; a value the model
merely remembers or infers is GUESS-grade — exclude it and list it under
"unverified". Apply the **"Evidence grade"** section of
`templates/workflows/extract.md` (canonical); `/ui:learn` adds no separate rule.

### Step 4 — Compile and verify

The routed flow ends by compiling a Design System on disk. Verify it is healthy
before reporting success:

```sh
ui ds status --json
ui ds context --strict --with-theme
```

Record the harvest as the provenance seed:

```sh
ui memory record harvested --data '{"source":"<url-or-path>","what":"<tokens/components summary>"}'
```

`ds status` must exit 0 (not `DS_TAMPERED`); `ds context --strict --with-theme`
must emit the context block and the compiled `@theme` block. A `DS_TAMPERED`
exit is terminal — surface it and stop.

### Step 5 — Readiness report

Emit a compact readiness report in exactly this shape:

```
✓ learned from <source> (<n> files sampled)
✓ design system: <k> tokens · <m> components registered (<s> with states) · persona <slug>
→ try: /ui:generate "<suggested intent from the product's domain>"
```

Derive the counts from `ui ds context --format json` and `ui registry list
--json`; draw the suggested intent from the product's own domain (inferred from
the sampled content), not a generic example.

## Outputs

- A populated `design/` directory (`design.tokens.json`,
  `component-registry.json`, `ds.manifest.json`) compiled by the routed flow —
  the project's design system, derived from its own UI.
- A short readiness report (step 5) plus an explicit list of sampled vs skipped
  files (step 3a) and any unverified/GUESS values excluded (step 3c).
- **No new HTML.** `/ui:learn` builds the system; run `/ui:generate` next to
  produce UI inside it.

No files are written outside the project directory. The only network access is
the URL route's fetch, which is owned by `from-url.md`.

## Quality gate

`/ui:learn` is complete only when:

- `ui ds status --json` and `ui ds context --strict` load cleanly — the DS is
  present and untampered;
- when the source was **code**, **≥1 component is registered** (a code project
  that yields zero reusable components means step 3a sampled too shallowly —
  re-sample across more surfaces);
- the report lists every value dropped as unverified/GUESS (step 3c), so the user
  can see exactly what the system did and did not learn.

The routed extraction flow owns its own DS-validity gate (see
`templates/workflows/extract.md` step 10); `/ui:learn` does not re-run it — it
confirms that outcome and reports readiness.
