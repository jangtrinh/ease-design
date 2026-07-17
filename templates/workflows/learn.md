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
`cssFiles`, `htmlFiles`, `componentDirs`, `designMd`, `dsStatus`, `truncated`,
`visited`, and a `verdict`. Summarise the findings for the user in **one short
paragraph** — the framework, the styling approach, how many component dirs /
HTML files were seen, and the verdict — not a raw dump.

**Truncation comes first.** If `truncated` is `true`, say so **before** stating
the verdict: the walk budget ran out (`visited` entries scanned) before the
whole tree was covered, so any empty or thin finding may just be unreached
ground, not a verdict on the project. `componentDirs: []` with `truncated: true`
must read as *"the budget ran out before any UI was found"* — never as *"this
project has no components"*. Only state "no UI here" outright when
`truncated` is `false`.

If `verdict` is already `ds-present`, tell the user a compiled DS exists and stop
unless they explicitly want to re-learn (e.g. after a major redesign);
re-learning replaces the system via `--force` inside the routed flow.

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul (project > studio > factory) > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

### Step 2 — Ask ONE question (source of truth)

Ask the user a **single** question with exactly four options — never more than
this one question:

1. **Learn from code** *(default when the verdict is `brownfield-code`)* —
   harvest the design system from the repo's own components and styles.
2. **Learn from a live URL** — capture a deployed page's real computed styles.
3. **Learn from a Figma file** — an existing design system/library (Variables,
   Styles, Components) is ingested wholesale; a single screen/frame is reproduced
   as HTML then extracted. The route (step 3) picks the path from the target.
4. **Start fresh with a persona** — nothing existing is worth keeping; compile a
   new system from scratch.

Preselect the default from the scan verdict but let the user override. Do NOT
ask follow-up questions about tokens, colours, spacing, or components — the
routed flow derives all of that from evidence.

### Step 3 — Route to the matching flow

Follow the flow for the chosen source; **do not** restate its steps here.

- **Code** → branch on whether the scan's `cssFiles` declare `--*` custom
  properties (a Tailwind v4 `@theme` block or a token-authored `:root`/theme
  selector — check with a quick `grep -c -- '--' <file>` or read the file):
  - **CSS custom properties present** → this is the code road's own C0
    (spec 009 P3): compile the vocabulary deterministically instead of having
    the host model eyeball values and issue one `change-token` per token (the
    old path — real cost measured at 102 calls on one project). Zero-network,
    zero-LLM:
    1. Harvest every declared custom property across **all** reported
       `cssFiles`, with per-line + per-selector provenance:
       ```sh
       ui designmd extract-tokens <any-sampled-html-or-empty.html> \
         --css "<cssFile1>,<cssFile2>,..." --out t.json
       ```
       `--css` takes a **single comma-joined flag** for multiple files — passing
       `--css` more than once is a `REPEATED_FLAG` error, not a silent
       last-file-wins. `<html-path>` is still required even for a CSS-only
       project (a known wart — pass a tiny placeholder `<html></html>` file).
    2. Compile it into a portable, unsealed `tokens.json` — literal values
       become primitives, `var(--x)` aliases become semantics, and each theme
       selector (`[data-theme="X"]`, `.dark`, `@media (prefers-color-scheme:
       dark)`) becomes a mode:
       ```sh
       ui ingest-css-ds t.json --out . --name "<ds-name>"
       ```
       A `LEAF_COLLISION` here (two source custom properties strip to the same
       token path, e.g. `--gray-900` and `--color-gray-900` both →
       `color.gray-900`) means the project really does declare both — rename
       one at the source or accept the message and move on; do not work
       around it by re-running with different input.
    3. Seal it into the store:
       ```sh
       ui ds import tokens.json --dir . --name "<ds-name>"
       ```
       `ui tokens compile design/design.tokens.json --target css` then emits
       the **base** mode only — other modes stay preserved in the token file
       and documented, exactly like the Figma C0 path above.
    4. Continue to step 3a for component sampling — the vocabulary is done;
       only components still need `extract.md`'s registration steps
       (`templates/workflows/extract.md` step 8 onward, driven by **step 3d**'s
       record-shape rules below), not its token steps (4–7, which this C0 path
       replaces for the values it could extract).
    - **Record, don't fix:** if the same primitive family is duplicated
      per-theme as parallel hardcoded ramps instead of one semantic layer over
      shared primitives (`knowledge/token-taxonomy.md`'s named DON'T), note it
      as a finding — there is no automatic normalisation for this yet.
  - **No CSS custom properties** (pure Tailwind utility classes, inline
    styles, CSS-in-JS with no `--*` declarations) → the C0 compiler has
    nothing to read. Follow `templates/workflows/extract.md` against the
    representative files chosen in step 3a instead — its Inputs accept this
    sampled set directly (spec 009 D5) — and apply **step 3d**'s record-shape
    rules when registering each component.
- **URL** → follow `templates/workflows/from-url.md` with the user's URL.
- **Figma** → branch on what the target IS:
  - **A design SYSTEM / library** (the user points at a file whose value is its
    Variables + Styles + Components — the common onboarding case) → **do NOT
    reproduce frames as HTML.** Scan the system once and compile it
    deterministically. This is the durable, zero-token on-ramp (C0):
    1. Pick the write/read bridge with the seat-adaptive selector (never hardcode
       a bridge) — see `knowledge/figma-agent-hand.md` §"Bridge selection".
    2. Scan the system to a `ds.json` inventory:
       ```sh
       figma-agent scan-design-system --out ds.json
       ```
    3. Compile it into ease-design's portable stores (zero-network, zero-LLM):
       ```sh
       ui ingest-figma-ds ds.json --out . --name "<ds-name>" --seed-memory
       ```
       This emits `tokens.json` (DTCG primitive+semantic tiers, incl. Light/Dark
       modes), `component-registry.json` (name · variants · props), and a
       `DESIGN.md` DS spec, and seeds `ui memory` so the system is remembered.
       The portable files ARE the durable memory (F0) — no per-turn re-read.
    4. Skip the reproduce-as-HTML + `extract.md` path entirely; go to step 4.
    - **LIVE-E2E PENDING:** `scan-design-system` reads a *live* plugin session;
      run it against the real file when the figma-agent plugin is open. The
      compile step (`ui ingest-figma-ds`) is deterministic and already testable
      against a fixture `ds.json`.
  - **A single screen / frame** → follow `templates/workflows/figma.md` to produce
    HTML, then feed that HTML into `templates/workflows/extract.md`.
  - **A SET of built screens** (the user points at a section/page of real,
    already-designed screens and wants ease-design to learn *how the DS is used* —
    the applied grammar / house style) → learn the CONVENTIONS (C7), the companion
    to the C0 vocabulary:
    1. Pick the bridge with the seat-adaptive selector.
    2. Distill the screens' usage DNA **in-plugin** — NEVER dump `get_metadata` for
       a section (see `knowledge/figma-agent-hand.md` §"Reading a whole section"):
       ```sh
       figma-agent scan-conventions <sectionId…> --out usage-dna.json
       ```
    3. Synthesize it (zero-network, zero-LLM) into an AI-readable house-style spec:
       ```sh
       ui synthesize-conventions usage-dna.json --ds tokens.json --out . --seed-memory
       ```
       This writes `CONVENTIONS.md` (measured DO/DON'T with counts, cross-referenced
       to the DS scale so real deviations are separated from valid tokens) and seeds
       `ui memory` prefers/avoids. The DON'Ts feed `/ui:audit` as convention rules
       and ground new generation in the product's house style.
    - **LIVE-E2E:** `scan-conventions` needs the live plugin (proven); `ui
      synthesize-conventions` is deterministic + fixture-tested.
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
**The `states` field on a registry record is dead** — measured 0/537 populated
in platform-design-system and 0/27 in the `ds init` kit; the only place it was
ever mandated was this doctrine. `--states` still takes the same comma list and
still refuses an unobserved or invalid value, but the kernel now folds each one
into `variants` as `State=<PascalCase>` (kit-identical to `Tone=`/`Size=`) and
leaves `states` unset (spec 009 D3).

#### Step 3c — Evidence grade (SOURCE-grade only)

Admit only values that trace to deterministic extraction; a value the model
merely remembers or infers is GUESS-grade — exclude it and list it under
"unverified". Apply the **"Evidence grade"** section of
`templates/workflows/extract.md` (canonical); `/ui:learn` adds no separate rule.

#### Step 3d — Component record shape for a code source (D1/D2/D4)

A code source needs three decisions an HTML page never raises, and they are
RESOLVED — do not re-derive them (spec 009 D1/D2/D4, from measuring dana +
platform-design-system + the `ds init` kit):

1. **One record per component, not per variant** (D1). A component's variant ×
   size × radius matrix is **one** registry entry — dana's `Button` (8 tones ×
   3 sizes × 3 radii = 72 combinations) is `Control/Button`, not 72 records.
   The matrix lives inside that one record's `variants` array. Name it
   `Category/Component` (`registry-store.ts:74`'s `NAME_PATTERN`,
   PascalCase/PascalCase) — code-authored components are exactly what that
   pattern exists for, per `figma-ds-registry.ts:9-14`'s own header (Figma
   inventory is a *different* door, by design; never route a code component
   through it).
2. **Axis names are the source's own prop names, PascalCased** (D2). If the
   component declares a prop literally named `variant`, the axis is
   `Variant=` (`variant="primary"` → `Variant=Primary`); a `size` prop is
   `Size=`. Do **not** re-interpret a prop name into a house term — dana's
   `variant` stays `Variant`, it never becomes `Tone`. If a prop name collides
   with `State` (step 3b), the source's own name wins; record the collision
   in the summary.
3. **`markup` is an HTML specimen sheet traced to real class strings** (D4).
   HTML is the design (owner decree, 2026-07-17): `/ui:generate` emits
   self-contained HTML and does not know frameworks exist — developers port
   it. A specimen sheet (kit-style: a wrapper + rows showing the variant
   matrix) is the honest equivalent for a code source, with one hard rule:
   every cell must trace to a class string the source actually declares —
   dana's `variantClasses.primary` in `Button.tsx` is right there, copy it
   verbatim. A cell you cannot trace, you do not draw; list it under
   "unverified" (step 3c). **Never render the component** to obtain markup —
   no jsdom, no testing-library, no dev server, even though dana has the
   toolchain to do exactly that — rendering a user's code is a No-Go
   (`brainstorm.md` §7).

With these three settled, `extract.md`'s steps 2–3 (discovery + canonical
naming) and step 8 (register) run unchanged against the sampled files.

### Step 4 — Compile and verify

**Figma design-SYSTEM ingest path:** the stores are already written by
`ui ingest-figma-ds` (step 3). Verify them instead of `ds status`: confirm
`ui tokens compile tokens.json --json` exits 0 (aliases resolve) and
`ui registry list --file component-registry.json --json` lists the components.
Then skip to step 5. (The `ds.manifest.json` checks below apply only to the
persona/extract-compiled paths.)

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

### Draft the soul from evidence

After the DS compiles, DRAFT `design/soul.md` from what you measured — never from
imagination. If a studio soul exists (`$EASE_DESIGN_HOME/studio-soul.md`), read it
first as a seed: a clause the project inherits unchanged from it cites
`— inherited: studio` instead of a fresh evidence citation. Each `## Never` /
`## Always` bullet cites its evidence inline
(`— evidence: 5/5 captured pages use display ≥ 44px; 0 gradients found`). Keep
`status: draft` in the frontmatter and tell the owner: review, edit, then set
`status: ratified`. Run `ui ds soul check` and report its findings.

### Step 5 — Readiness report

Emit a compact readiness report in exactly this shape:

```
✓ learned from <source> (<n> files sampled)
✓ design system: <k> tokens · <m> components registered (<s> with observed states) · persona <slug>
→ try: /ui:generate "<suggested intent from the product's domain>"
```

Derive the counts from `ui ds context --format json` and `ui registry list
--json`; draw the suggested intent from the product's own domain (inferred from
the sampled content), not a generic example. `<s>` counts records whose
`variants` array contains a `State=*` entry (spec 009 D3) — **not** the
record's own `states` field, which stays unset.

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
