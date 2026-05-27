# Workflow — `/ui:from-url`

## Title

`/ui:from-url <url> [--name <slug>] [--out-dir <path>] [--force]` —
**extract a portable design spec from a live URL into a per-project
folder**. Point at any website, get back a self-contained folder at
`./<slug>/` carrying a `DESIGN.md` that conforms to the Google-Labs
alpha spec (YAML front-matter + 8 ordered Markdown sections), a
viewable `DESIGN.preview.html` snapshot, the raw source bytes that
proved the tokens, and a deterministic `audit.md` report whose exit
code gates workflow success.

This workflow is the **inverse of `/ui:extract`** at the format layer.
`/ui:extract` reads a local HTML file and writes the ease-design
internal SSOT (`design/*.json`, DTCG two-tier). `/ui:from-url` reads a
live URL and writes the open-spec `DESIGN.md` plus six audit-trail
files that any coding agent can consume.

Use `/ui:from-url` when:

- The user wants a portable, agent-readable brand spec they can hand
  to any tool that understands `DESIGN.md`.
- The source of truth is a **live URL**, not a local HTML file.
- The project has no design system yet and the user wants to capture
  one *as documentation* before deciding whether to compile it into
  `design/*.json` via `/ui:extract`.

This workflow does **not** mutate `design/*.json`. It writes one
folder at `./<slug>/` and stops.

---

## Inputs

| Input | Source | Required | Notes |
|---|---|---|---|
| `<url>` | path argument | yes | A single URL the host CLI can resolve. Multi-page crawl is out of scope. |
| `--name <slug>` | flag | no | Overrides the URL-derived folder slug. Must be kebab-case. |
| `--out-dir <path>` | flag | no | Relocates the run folder. Default: CWD. |
| `--force` | flag | no | Overwrites an existing run folder without confirming. |
| Rendered HTML body | host CLI fetch (WebFetch / `curl` / bb-browser MCP) | yes | The `ui` binary is **not** invoked for fetching — same contract as `from-ref.md`. |
| Linked stylesheets | host CLI fetch (every `<link rel="stylesheet">` in the HTML) | yes | **Required**, not optional. Raw CSS bytes are the source of truth for tokens; the workflow's audit gate FAILs without them. |
| Viewport screenshot | host CLI fetch (≥ 1280×800) | yes | Cross-checks the HTML-derived tokens against the rendered pixels. |
| DESIGN.md format spec | `knowledge/designmd-format.md` | yes | The pinned on-disk reference for YAML schema + 8 sections + token formats + versioning, *including* the Token-precision sidebar. |
| Color science | `knowledge/color-science.md` | yes | OKLCH bucketing + WCAG contrast rules. Same as `/ui:extract`. |
| Token taxonomy | `knowledge/token-taxonomy.md` | yes | Typography / spacing / radius conventions, reused for the YAML token shapes. |
| Component catalog | `knowledge/component-catalog.md` | yes | Canonical category + variant naming, reused for the YAML `components:` keys (lowercased for DESIGN.md compatibility). |
| Persona index | `knowledge/persona-index.md`, `knowledge/personas/*.md` | yes | Used to synthesise the persona family that drives the Overview prose. |

---

## Steps

### 1. Resolve the URL (HTML + linked CSS, mandatory)

The host CLI fetches **both** the HTML body and every linked stylesheet
the HTML references. Both are required — the workflow's audit gate
FAILs if linked CSS is absent (or downgrades to summary-grade WARN if
the fetch tool genuinely cannot reach the CSS due to CORS / auth).

Use the strongest tool available, in priority order:

1. **WebFetch** (Claude built-in) — preferred. Returns sanitised
   rendered HTML; works for SSR sites.
2. **`curl`** via Bash — fallback for runtimes without WebFetch (Codex,
   generic shells). Returns raw response body.
3. **bb-browser MCP** — required for JS-heavy / SPA pages where (1) and
   (2) return only an empty shell. Captures the rendered DOM + screenshot.

After the HTML is in hand, **parse `<link rel="stylesheet">` tags** and
fetch every one (same tool tier — `curl` is fine for CSS even if
WebFetch was used for HTML). Concatenate fetched bytes into a single
`source.css` document for the next step. Inline `<style>` blocks
inside the HTML count as CSS too — the extractor handles both.

Also capture a viewport screenshot ≥ 1280×800. If the chosen fetch
tool cannot take a screenshot (plain `curl` cannot), promote one rung
up the chain — bb-browser MCP can.

The `ui` binary is **not** invoked in this step. This mirrors the
host-CLI-fetches contract from `templates/workflows/from-ref.md` step
1 and preserves the deterministic-no-network guarantee from CLAUDE.md.

### 2. Graceful degrade chain

If the fetch above is incomplete, walk the chain explicitly and tell
the user which rung succeeded so the choice is auditable:

- **HTML empty or JS-shell only** → escalate to bb-browser MCP for the
  rendered DOM + screenshot, then re-parse `<link rel="stylesheet">`.
- **bb-browser MCP unavailable** → ask the user to paste saved HTML or
  provide a local screenshot path. Both are first-class inputs.
- **Linked CSS blocked (CORS / auth)** → record what was unreachable.
  The audit's source-fidelity family will WARN "summary-grade only"
  rather than FAIL; surface that to the user explicitly.
- **User supplies HTML only** (no screenshot) → run the rest of the
  workflow but skip the screenshot cross-check in step 5; flag that the
  HTML-only path was used in the run-summary at step 8.
- **User supplies screenshot only** (no HTML) → behave like
  `templates/workflows/from-ref.md` step 3: build a vision-derived
  brief, then synthesise the YAML from that brief instead of from raw
  HTML. Source-fidelity will WARN summary-grade.

Record the exact fetch path used. It becomes part of the run-summary
written in step 8.

### 3. Read the knowledge core

Open these files once, in this order, and keep them in context for the
rest of the workflow:

- `knowledge/designmd-format.md` — the authoritative format contract,
  **including the Token-precision sidebar** that defines raw CSS as
  source-of-truth and WebFetch summaries as inference-only.
- `knowledge/color-science.md` — OKLCH bucketing + WCAG targets.
- `knowledge/token-taxonomy.md` — typography / spacing / radius
  conventions.
- `knowledge/component-catalog.md` — canonical Category/Variant names.
- `knowledge/persona-index.md` — persona scoring routine for the
  Overview prose synthesis.

### 4. Token harvest via the binary

Source tokens come from `ui designmd extract-tokens`, **not** from
prose-summary inference. Run the binary against the raw fetched bytes:

```sh
ui designmd extract-tokens <slug>/source.html \
  --css <slug>/source.css \
  --out <slug>/tokens.json
```

The output `tokens.json` carries:

- `colors[]` — frequency-ranked hex values with line-level provenance.
- `fonts[]` — every observed `font-family` first-name (generic
  fallbacks like `sans-serif` are stripped).
- `customProperties[]` — every CSS custom property declaration, with
  the resolved hex when the value is a literal hex.

Draft the DESIGN.md YAML against this JSON, not against the WebFetch
prose summary. The audit's source-fidelity family compares emitted YAML
hex values back to `tokens.json` and FAILs on any value with `count = 0`
(invented). The same family compares emitted `fontFamily` first-names
back to `tokens.json` `fonts[]` and FAILs on names absent from the
source.

The `designmd-emit` skill (`templates/skills/designmd-emit.md`)
carries the source-of-truth precedence rules for the emit step.

### 5. Cross-check tokens against the screenshot

Use the host model's native vision on the screenshot from step 1.
Verify three signals against the YAML draft from step 4:

1. **Dominant brand colour.** If the screenshot shows a clearly
   dominant accent that is missing from `tokens.json` (e.g. brand
   colour locked inside an `<img>`, `<svg>` background, or `--var(...)`
   that the extractor couldn't resolve), the screenshot wins. Replace
   the YAML value and add an inline YAML comment recording the
   disagreement.
2. **Overall density.** If the screenshot reads as more (or less)
   spacious than the harvested `spacing` scale suggests, recompute the
   working unit.
3. **Type weight character.** If the screenshot's display headlines
   read heavier or lighter than the harvested weights suggest, adjust
   the relevant typography slot.

Every override gets a one-line YAML comment of the form
`# screenshot override: <reason>` so the decision is auditable.

The cross-check **does not bypass** the audit. The audit still checks
your overrides against `tokens.json`; if a screenshot-derived hex
genuinely isn't in the CSS at all, the audit's source-fidelity row
will FAIL and you must either move the override to a custom-property
declaration in `tokens.json` or document the source explicitly.

### 6. Discover components

Walk the HTML again. Apply the same repetition + role detection from
`templates/workflows/extract.md` step 2:

- **Repetition signal.** Class strings or wrapper structures that
  appear two or more times.
- **Role signal.** Singletons whose role is unambiguous from
  structure (`<nav>`, `<header>`, `<footer>`, hero `<section>`,
  pricing block).
- **Granularity rule.** Capture both layout-level (hero, pricing grid,
  footer) and atom-level (primary button, secondary button, badge,
  input) patterns. De-duplicate by visual identity.

For each candidate, emit one entry under YAML `components:` with a
short lowercase-hyphenated key. Each value is an object using
`"{ref}"` strings against the tokens harvested above:

- `backgroundColor` — `"{colors.<group>.<name>}"`
- `textColor` — `"{colors.<group>.<name>}"`
- `typography` — `"{typography.<group>.<name>}"`
- `rounded` — `"{rounded.<name>}"`
- `padding` — `"{spacing.<n>}"` or `"{spacing.<n>} {spacing.<m>}"`

Aim for 5–15 components. Throw away one-off decorative blobs.

When choosing the `textColor` / `backgroundColor` refs, prefer pairs
that clear WCAG 4.5:1 body contrast — the audit's accessibility family
will FAIL pairs below WCAG 3:1 and WARN pairs between 3:1 and 4.5:1.

### 7. Compose the 8 Markdown sections in spec order

Invoke the **designmd-emit** skill (`templates/skills/designmd-emit.md`).
The skill carries the section-order checklist, format rules, and
source-of-truth precedence rules; this step provides the *content*.

1. **Overview** — one paragraph of persona-style prose. Synthesise a
   persona using `knowledge/persona-index.md` against keywords pulled
   from the brief.
2. **Colors** — table of the semantic colour roles and their hex values.
3. **Typography** — table of the type ramp.
4. **Layout** — observed grid, density, section pacing, max widths.
5. **Elevation & Depth** — shadow ladder.
6. **Shapes** — radius family observed.
7. **Components** — one short note per component (matching the keys in
   YAML `components:`).
8. **Do's and Don'ts** — 3–5 bullets each.

### 8. Write the per-project folder

The output goes to `./<slug>/` where the slug is derived from the URL
hostname (`www.` stripped, dots and slashes replaced with dashes,
lowercased). Examples: `https://www.traicaybentre.com/` →
`./traicaybentre-com/`; `https://nextjs.org/docs` → `./nextjs-org/`.

`--name <slug>` overrides the derivation (must be kebab-case).
`--out-dir <path>` relocates the folder.

Step sequence:

8.1 **Derive the slug.** Use the rule above, or honour `--name`.

8.2 **Confirm overwrite.** If `./<slug>/` already exists and `--force`
   is not set, ask the user via `AskUserQuestion` whether to overwrite
   or pick a different name.

8.3 **Write `./<slug>/source.html`** — the raw bytes fetched in step 1.

8.4 **Write `./<slug>/source.css`** — the concatenated linked stylesheets
   from step 1.

8.5 **`./<slug>/tokens.json` already exists** from step 4 if you ran
   the binary directly into the folder; otherwise copy it in now.

8.6 **Write `./<slug>/DESIGN.md`** — the YAML + 8 sections from step 7.

8.7 **Run `ui designmd snapshot`** to produce the self-contained
   preview HTML:
   ```sh
   ui designmd snapshot <slug>/source.html \
     --origin <url> \
     --css <slug>/source.css \
     --out <slug>/DESIGN.preview.html
   ```
   The output strips Next.js / React / Angular hydration scripts,
   inlines the CSS, removes inline `opacity:0;transform:translate*`
   reveal-state attributes (Framer-Motion-style scroll-reveal init
   states that JS would otherwise resolve), and absolutises root-
   relative URLs against `--origin` so images and fonts still load.

8.8 **Write `./<slug>/run-summary.md`** — a short report carrying:
   - URL + slug + timestamp.
   - Fetch path used per rung (WebFetch / curl / bb-browser MCP /
     paste / vision-only).
   - Token counts (colours, typography slots, components).
   - Persona family chosen for the Overview prose.
   - Any overrides recorded in step 5.

### 9. Audit gate (hard exit-code gate)

Run the deterministic audit. Its exit code drives workflow success —
the host model cannot bypass it.

```sh
ui designmd audit ./<slug>/
```

The audit runs five families: **format** (YAML parses, 8 sections in
order, no duplicate headings, hex/dimension shape, exact heading text,
`version` is `"alpha"` if present), **source-fidelity** (every emitted
hex appears in `source.css`; top source hex are emitted or excluded;
emitted fonts present in source), **ref-integrity** (every
`"{group.name}"` resolves), **accessibility** (every component fg/bg
pair clears WCAG via `ui color contrast`), **discipline** (no
plan-reference leakage; no `TODO`/`FIXME`/template-token markers).

It writes `audit.md` and `audit.json` into the run folder and exits:

- **Exit 0 — PASS.** Print the audit summary to the user, stop. The
  workflow is complete.
- **Exit 1 — FAIL.** STOP. Surface each FAIL row to the user with
  file, expected, observed, and `suggestedFix`. The host model may
  re-emit the DESIGN.md to address the failures, run the audit again,
  and continue if the re-emit clears the FAIL. **Re-emit budget = 2
  attempts.** On the third consecutive FAIL, hand off to the user with
  the full audit report and ask whether to override or amend by hand.
- **Exit 2 — WARN-only.** Print warnings, use `AskUserQuestion` to ask
  whether to accept or re-emit. Accepting is fine — WARN rows record
  judgement calls (e.g. summary-grade only, large-text contrast at
  3.5:1) rather than spec violations.

The 6+1-axis taste rubric in `templates/workflows/critique.md` does
not apply here — that gate scores rendered HTML against a persona's
craft targets, and this workflow produces a spec document, not pixels.
The audit replaces it for `/ui:from-url`. State this explicitly to the
user: *"this workflow produces a spec document, so the 6+1-axis taste
gate does not apply; the audit is the closure step."*

---

## Outputs

A self-contained folder at `./<slug>/`:

```
./<slug>/
├── DESIGN.md                ← the spec (Google-Labs alpha)
├── DESIGN.preview.html      ← self-contained snapshot, opens in any browser
├── source.html              ← raw fetched HTML (audit trail)
├── source.css               ← concatenated linked stylesheets (audit trail)
├── tokens.json              ← `extract-tokens` output; frequency-ranked tokens
├── run-summary.md           ← fetch path, token counts, persona, timestamp
├── audit.md                 ← human-readable PASS/FAIL/WARN report
└── audit.json               ← machine-parseable mirror
```

Summary printed to the host model surface: the audit verdict,
PASS/WARN/FAIL counts, the slug, the URL, and the fetch path used.

**No changes to `design/*.json`.** This workflow does not touch the
internal ease-design SSOT. Run `/ui:extract` on a later generated HTML
page if you want the DTCG store populated too.

---

## Quality gate

The `ui designmd audit` exit code **is** the quality gate. PASS (0) →
workflow succeeds. FAIL (1) → workflow stops; re-emit budget of 2
attempts before user handoff. WARN (2) → workflow asks the user.

Subsequent HTML generated against the spec via `/ui:generate` *will*
be scored by `critique.md` per its own contract. That is the right
time for the taste gate, not now.
