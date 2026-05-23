# ease-design Templates

Runtime-neutral workflow and skill Markdown that the per-runtime adapters in `src/adapters/` ship into Claude Code, Antigravity, and Codex. The files here describe what the host AI model does; the adapters wrap them in each CLI's invocation syntax.

## Workflows — `workflows/`

User-facing entry points (`/ui:<verb>` on Claude Code; analogous shapes elsewhere). Each file is a step-by-step instruction set with concrete `ui` binary invocations and `knowledge/` file references.

| File | Verb | What it does |
|---|---|---|
| `generate.md` | `/ui:generate` | Central design-generation flow: classify intent → select 3 personas → compile DS if absent → produce 3 variants → critique → autofix → user picks. |
| `iterate.md` | `/ui:iterate` | Surgical edit to an existing variant via `ui edit-strategy` (deterministic / ln-diff / full-regen). |
| `refine.md` | `/ui:refine` | Self-correction pass: critique → identify failing axes → refine those → re-critique. ≤2 passes. |
| `redesign.md` | `/ui:redesign` | Radical contra-persona redesign preserving the source's information architecture. |
| `extract.md` | `/ui:extract` | Inverse of `generate`: extract a design system from existing HTML (populated DS + registered components). |
| `from-ref.md` | `/ui:from-ref` | Generate from a reference image/screenshot — produces a structured brief, then hands off to `generate.md`. |
| `figma.md` | `/ui:figma` | Import a Figma frame URL into HTML; binary stays network-free, host CLI handles the API call. |
| `slides.md` | `/ui:slides` | Slide-deck flow: outline → shared chrome → per-slide generation under the 1920×1080 slide-mode constraints. |

`critique.md` (the 6+1-axis taste loop the workflows hand off to) is built in the critique-gate phase.

## Skills — `skills/`

Small wrappers that tell the host model *which `knowledge/` files to read for which task*. The Phase 6 adapters expand these into runtime-specific skill files (e.g. Claude Code skills, Antigravity skills).

| File | Use when |
|---|---|
| `pick-persona.md` | Choosing a persona slug from intent. |
| `score-taste.md` | Grading a generation against the six craft axes. |
| `check-consistency.md` | Grading the seventh axis (DS / registry reuse). |
| `color-decision.md` | Picking colors, building palettes, checking contrast. |
| `token-model.md` | Defining, aliasing, or mutating tokens. |
| `apply-prompt-mode.md` | Choosing `replicate` / `enhance` / `adapt` against a reference. |

## How runtimes consume these

`ui init --runtime <claude|antigravity|codex>` (Phase 6) generates per-runtime adapter files that reference these templates. The templates themselves stay runtime-neutral — no Claude-specific slash-command syntax inside them — so a single edit here propagates to every CLI on the next `ui init`.
