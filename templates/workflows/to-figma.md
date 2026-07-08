---
description: "Author idiomatic Figma on the canvas from intent or an existing ease-design output. Use when the user wants a design built or edited in Figma (auto-layout, components, variables) via the figma-agent hand."
---

# `/ui:to-figma` — Author idiomatic Figma from intent

Turn a plain-language intent (or a design you already produced with ease-design) into
**real, idiomatic Figma** on the canvas — auto-layout structure, component instances,
token-bound variables — the kind of file a senior designer would accept the *layer
structure* of, not just the pixels. Works on Figma Free.

This is the inverse direction of `/ui:figma` (which imports a Figma frame → HTML). Both
directions stay; pick by intent.

## Important — what the binary does NOT do

The `ui` binary makes **no network calls** and never talks to Figma. Its deterministic
part here is local-only: persona selection scoring, token compilation, taste linting.

The **hands** are an *external* tool: the `figma-agent` CLI, driven over Bash, which talks
to a Figma plugin. It is **not** part of ease-design's `ui` binary and is **not** installed
by ease-design. Read `knowledge/figma-agent-hand.md` for setup — it requires a local clone
of the **figma-design-agent** repo with its Figma plugin loaded in Figma Desktop. If that
hand is unavailable, stop and tell the user how to obtain it, or fall back to `/ui:generate`
(HTML) instead.

## Inputs

- `<intent>` — plain-language description of the screen/component to build
  (e.g. `pricing page for a developer-tools SaaS, 3 tiers, dark`).
- *(optional)* `--from <path>` — start from an existing artifact instead of pure intent:
  a `DESIGN.md` folder, a generated `index.html`, or a persona-compiled design system.
  When given, reuse that design system's tokens rather than deriving new ones.
  **Behavioral clone handoff:** point `--from` at a `<slug>/capture/` folder produced by
  `/ui:from-url`'s `figma-agent capture` — build from `page.html`, then replay
  `behavior.json` states as variant reactions + keyframes as Motion tracks (intent-recipe 15).
- *(optional)* `--mode <mobile|desktop>` — target surface; infer from intent if omitted.

## What to read (in order)

1. `knowledge/figma-agent-hand.md` — the hand: setup, `status` health check, the command
   table, and the `export-png → Read` loop. Confirm the hand is live **before** authoring.
2. `knowledge/figma-craft/figma-craft.md` — the construction brain: craft philosophy,
   the decision ladder (which reference to read for layout / components / structure /
   visual craft / recipes), the build workflows, and the L1–L14 construction lints.
3. Follow the decision ladder into the relevant `knowledge/figma-craft/*` reference only
   as needed — do not read all five up front.

## Steps

### 1. Brief + persona

Establish a one-paragraph brief (persona label, UI type, mode, dominant visual language).
Use the `pick-persona` skill + `knowledge/persona-index.md` to score the intent and select
a concrete persona slug. If `--from` points at an existing design system, adopt its persona
and tokens instead of choosing anew.

### 2. Know the file before authoring

Run the hand's inventory so you build on what exists (never redraw a lookalike of an
existing component):

```bash
$FA scan-design-system --out ds.json
```

Read the components, variables, and styles already in the file. `figma-craft` rule:
instances over copies, variables over hardcoded values.

### 3. Build — pick the path (see figma-craft §Build workflows)

- **Path A — converter (fastest for full screens).** If you have (or can author) HTML for
  the screen — e.g. from `--from index.html` or a quick `/ui:generate` — feed it through
  the converter:

  ```bash
  $FA html-to-figma --html screen.html --width 1440
  ```

  Read the returned root id **and the warnings**. Author HTML per the converter limits in
  `knowledge/figma-agent-hand.md` (Google fonts only, plan to rebuild collapsed badges).

- **Path B — native (more control, for components).** `create-frame` → `set-autolayout`
  → `create-instance` / `set-text` children → `bind-variable` each themed property.
  Prefer this for anything that will become a reusable component.

Do all experiments on a scratch page named `[FA …]`, never on a user page.

Record the Figma rendition (same design id, figma medium):

```bash
ui memory record rendition_created --data '{"sourceDesignId":"<design-id>"}' --design "<design-id>" --medium figma --artifact-ref "<node-id>"
```

### 4. Construction lints — after EVERY build, before critique

Run the `figma-craft` L1–L14 lints (one combined `exec-js` walk over the built frame) —
absolute-soup, truncation-risk, off-grid spacing, unbound fills, lookalike frames, missing
fonts, radius scale, grid legality, root sizing, fill-in-hug, etc. Fix each hit with the
**narrowest** targeted `exec-js` (specific node ids, never page-wide `findAll` mutations),
then re-lint until clean.

### 5. Critique loop (the eyes)

```bash
$FA export-png --node <BUILT_FRAME_ID> --out out.png --scale 2
```

`Read` the PNG, then run ease-design's critique gate — `templates/workflows/critique.md`
scored against the `knowledge/taste-rubric.md` axes. Fix the failing axis with targeted
`exec-js`, re-export, re-score. Iterate to the ship bar or a hard cap of 5 rounds; an honest
STOP beats a discounted ship.

Once a canvas critique verdict is produced, record it (mirroring generate.md Step 6c, with the figma medium):

```bash
ui memory record taste_verdict \
  --data '{"scores":<axis-scores>,"lowestAxis":"<axis>","round":<n>,"pass":<true|false>}' \
  --design "<design-id>" --medium figma
```

### 6. Deliver

Move the final artifact to where the user asked (off the `[FA …]` scratch page). Report the
node id, the persona used, and the final critique score.

## Outputs

- Idiomatic Figma nodes on the canvas (auto-layout, instances, token-bound variables),
  passing the L1–L14 construction lints and the critique gate.
- The scratch `[FA …]` page is cleaned up; only the delivered artifact remains.

## Quality gate

Run `templates/workflows/critique.md` on the exported PNG. Correctness first — any L1–L14
lint hit or a truncation/contrast/overlap defect is a **gate**, not a deducted point: fix it
before scoring. Then score the taste axes; ship only at the bar, else STOP honestly.
