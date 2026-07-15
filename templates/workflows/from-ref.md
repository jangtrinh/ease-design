---
description: "Generate high-fidelity HTML from a reference screenshot or image. Use when the user provides an image to reproduce or draw inspiration from."
---

# `/ui:from-ref` — Generate from a reference

Generate a high-fidelity HTML page from a **reference** — a screenshot, mockup,
photograph, or any image URL the host CLI can resolve. The host model uses its native
multimodal vision to read the image, produces a structured design brief, picks a
**prompt mode** (replicate / enhance / adapt), then hands off to the standard
generation flow.

This workflow assumes the host model can see images natively. The `ui` binary itself
never loads or fetches the image — that is the host CLI's job. The binary only
deterministically processes the resulting HTML at the end.

## Inputs

- `<image-or-link>` — a local file path **or** a URL the host CLI can resolve. The host
  model must be able to view the pixels; if it cannot, stop and tell the user.
- *(optional)* `--prompt-mode <replicate|enhance|adapt>` — overrides the workflow's own
  inference. If omitted, the workflow picks one based on the user's phrasing (rules
  below); if neither the user nor the workflow can decide, default to **replicate**.
- *(optional)* `--hint "<free text>"` — extra user intent (e.g. *"keep the layout but
  use our brand colors"*). Folded into the brief.
- *(optional)* `--mode <mobile|desktop|component|slide|dashboard|app|admin|ecommerce>`
  — overrides the inferred UI mode. Otherwise the brief's `LAYOUT` zone selects it.

## Steps

### 1. Load the reference

The host model opens the image locally or via URL. If the image is unreadable, stop
and report — do not guess at pixels you cannot see.

### 2. Read the relevant knowledge files

Open these files once, in this order, and keep them in context for the rest of the
workflow:

- `knowledge/prompt-modes.md` — definition of replicate / enhance / adapt and their
  creativity settings.
- `knowledge/persona-index.md` — lookup table + scoring rules for picking personas.
- `knowledge/taste-rubric.md` — the 6+1 axes the final output will be scored on.
- `knowledge/mode-constraints.md` — the universal style guide and the active UI mode's
  rule set. Read selectively: only the mode you will use.

### 3. Produce a structured design brief

Acting as an elite UI/UX design analyst, extract a **structured brief** from the
reference. Be specific — map visual elements to concrete values (hex codes, pixel
estimates, structural relationships). Do not hallucinate elements that are not
visible. Use the user's hint to bias the analysis toward their intent.

Emit the brief as a single JSON object with this exact shape:

```json
{
  "persona_label": "Glassmorphic Brutalism",
  "ui_type": "landing",
  "industry": "fintech",
  "layout": {
    "root": "centered hero + 3-column feature grid + footer",
    "columns": 3,
    "pacing": "alternating immersive sections with constrained max-w-7xl bands",
    "density": "comfortable"
  },
  "colors": {
    "primary": "#0F172A",
    "secondary": "#22D3EE",
    "background_pairings": ["#0F172A on #F8FAFC", "#22D3EE accent on #0F172A"],
    "text_contrast_scale": ["#F8FAFC", "#CBD5E1", "#94A3B8"],
    "gradients": ["linear-gradient(135deg, #22D3EE, #6366F1)"]
  },
  "typography": {
    "stack": "sans + mono accents",
    "headings": [
      { "level": "display", "size_px": 72, "weight": 700 },
      { "level": "h1", "size_px": 48, "weight": 700 },
      { "level": "h2", "size_px": 32, "weight": 600 }
    ],
    "body_size_px": 16,
    "line_height": 1.55
  },
  "components": [
    { "kind": "primary button", "radius_px": 12, "shadow": "0 8px 24px rgba(34,211,238,.35)", "states_visible": ["default", "hover"] },
    { "kind": "feature card", "radius_px": 16, "border": "1px solid #1E293B", "padding_px": 24 }
  ],
  "imagery": {
    "treatment": "photographic, low-saturation, rounded corners",
    "aspect_ratios": ["16:9 hero", "1:1 thumbnails"],
    "icon_style": "stroke, 1.5px, Lucide"
  },
  "spacing": {
    "scale": "8-pt base",
    "section_gap_px": 96,
    "card_padding_px": 24,
    "density_class": "comfortable"
  },
  "effects": {
    "elevation_layers": ["lvl1 subtle shadow on cards", "lvl3 large shadow on modal"],
    "blur_layers": ["backdrop-blur-md on top nav"],
    "interaction_indicators": ["scale-95 on press", "ring-2 ring-cyan-400 on focus"]
  },
  "anti_patterns_to_avoid": [
    "lorem ipsum",
    "low-contrast text on gradient",
    "icon-only buttons without labels"
  ],
  "user_hint": "<verbatim hint from --hint if any>"
}
```

The brief is descriptive only — **no HTML, no functional code**. If a zone is not
observable in the reference, omit it rather than invent values.

### 4. Pick a prompt mode

Pick exactly one of **replicate**, **enhance**, **adapt** from
`knowledge/prompt-modes.md`. Use this rule:

| Cue in the user's phrasing | Prompt mode |
|----------------------------|-------------|
| "rebuild this", "match exactly", "1:1", "convert this screenshot" | replicate |
| "improve", "modernize", "polish", "make it nicer", "fix the design" | enhance |
| "make a desktop version", "port to mobile", "same thing for X" | adapt |
| nothing above; the user just attached an image | replicate (default) |

If `--prompt-mode` is set, use it verbatim and skip the inference. Record the chosen
mode and a one-sentence justification in the working notes.

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul (project > studio > factory) > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

### 5. Infer a persona from the brief

Using `knowledge/persona-index.md`:

1. Concatenate `persona_label`, `ui_type`, `industry`, and visible keywords from the
   brief into a single search string.
2. Apply the keyword-scoring + industry-affinity rules to rank personas.
3. Apply the diverse top-K rule to pick **one** persona that fits the brief's
   aesthetic best — not three. The reference already locks the direction; variants
   come later via `/ui:iterate` if the user wants them.
4. Once a persona is chosen, open its family file under `knowledge/personas/<family>.md`
   for the full DNA. Keep it in context.

### 6. Ensure a design system exists

Check the project root for `ds.manifest.json`.

- If absent, compile one before generating:
  ```sh
  ui ds init <project-name> --persona <chosen-persona-slug> --intent "<user prompt + brief.persona_label>"
  ```
  If `ui ds init` exits non-zero, split by **argument provenance** (run with
  `--json` for `error.code` + `error.message`). Recoverable — model-derived;
  fix and re-invoke ONCE (hard cap, one retry): `BAD_NAME` → re-slugify
  `<project-name>`; `PERSONA_NOT_FOUND` → substitute the next-best persona
  from step 5; `BAD_INTENT` → trim the intent to ≤ 512 chars. Terminal —
  surface `error.message` and stop: `BAD_BRAND_HEX` (user-supplied — ask for
  a valid `#RRGGBB`), `DS_TAMPERED`, `DS_EXISTS`, and any privacy/permission
  stop. If the single retry fails again, treat it as terminal.
- If present, verify it is intact:
  ```sh
  ui ds context --strict --format markdown --max-bytes 4096 --with-theme
  ```
  `--strict` activates the hash-tamper check and the registered-components-only
  enforcement preamble. A non-zero exit means the manifest is stale, the
  on-disk tokens were edited out-of-band (`DS_TAMPERED`), or the registry
  is out of sync — stop and tell the user.

### 7. Hand off to the generate flow

Invoke `templates/workflows/generate.md` with this payload bound into its prompt:

- **prompt** — the user's original request plus the brief's `user_hint`.
- **brief** — the JSON object from step 3, inlined verbatim.
- **prompt_mode** — the value chosen in step 4. Apply its strategy modifier on top of
  the active UI mode (see the closing paragraph of `knowledge/prompt-modes.md`).
- **persona** — the slug chosen in step 5.
- **mode** — the UI mode (from `--mode` or inferred from `brief.ui_type` via
  `knowledge/mode-constraints.md`'s mode-selection table).
- **design_system_context** — the output of `ui ds context --format markdown
  --max-bytes 4096 --strict --with-theme` (the appended `@theme` fenced
  section fills generate's `<design_tokens>` slot; the context block fills
  `<design_system>`).

For multimodal-capable hosts, keep the source image attached so the model can
cross-check pixels while it generates — especially under **replicate** mode.

The generate flow runs the same three-variant + critique loop as a normal
`/ui:generate`. Under **replicate** it should produce only one variant (the reference
locks the direction); under **enhance** or **adapt**, the standard three.

### 8. Deterministic post-pass

When the generate flow returns HTML, run:

```sh
ui autofix <file.html> --write
ui validate-layout <file.html>
```

Fix any structural errors `validate-layout` flags before passing the output to the
quality gate.

## Outputs

- `output/<slug>-from-ref.html` — the generated HTML. One file under **replicate**;
  up to three under **enhance** or **adapt**.
- `output/<slug>-from-ref.brief.json` — the structured brief from step 3, saved
  alongside the HTML for reproducibility.
- A short summary printed to stdout: chosen prompt mode, chosen persona, UI mode,
  variant count, and the path of the highest-scoring output.

## Quality gate

The output is **not** finished until it passes the critique gate. After step 8, run
`templates/workflows/critique.md` on every variant:

- Score the 6 taste axes plus the consistency axis.
- Any axis below threshold triggers the refine-the-failing-axis loop, capped per
  `critique.md`.
- Under **replicate**, the critique also runs a fidelity check: does the output match
  the brief's colors, typography, spacing, and component structure within tolerance?
  Treat fidelity drift as a Layout / Typography failure and refine.
- Under **enhance**, the critique allows deliberate departures from the source as
  long as the brief's information architecture is preserved.
- Under **adapt**, the critique allows structural changes but rejects content loss —
  every entry in `brief.components` must still be expressible in the output.

Variants that cannot reach the threshold within the cap are surfaced to the user
along with the lowest-scoring axis, per `critique.md`.
