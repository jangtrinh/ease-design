# figma-craft — construct like a senior designer

How to construct idiomatic Figma — the senior-designer construction brain. Read this
before building, editing, converting, or fixing anything on a Figma canvas (via the
external `figma-agent` CLI's `create-frame`, `set-autolayout`, `create-instance`,
`create-variable`, `bind-variable`, `html-to-figma`, `exec-js`, or when writing
Plugin-API JS that touches nodes directly). Covers auto-layout/GRID/constraints mastery,
HUG-FILL-FIXED sizing, components-instances-variants, variable binding, structure
hygiene, visual craft, and per-intent build recipes. Use BEFORE building (pick the right
construction) and AFTER building (run the construction lints).

The `figma-agent` CLI gives you hands (`figma-agent-hand.md`). This file is the
brain that decides WHAT those hands build. Output must be idiomatic Figma — a file a senior
designer would accept the *layer structure* of, not just the pixels.

## Craft philosophy — non-negotiable defaults

1. **Auto-layout first, absolute never (for flow content).** Every multi-child frame gets
   `layoutMode` HORIZONTAL/VERTICAL/GRID. Absolute x/y is reserved for genuine overlays
   (`layoutPositioning: 'ABSOLUTE'` + constraints) and freeform art. A frame of children at
   hand-placed coordinates is the #1 AI-slop signature.
2. **Sizing is a decision, not a default.** For every frame and every child, choose
   HUG / FILL / FIXED deliberately per axis. Live-proven failure modes: auto-layout children
   get counter-axis STRETCHED unless sizing is set — pills/badges/buttons must HUG both axes;
   fixed tiles (icons, avatars, step-number circles) must be FIXED both axes (the 40x40
   step-number bug); single-line TEXT without `textAutoResize='WIDTH_AND_HEIGHT'` truncates
   when font metrics drift.
3. **Instances over copies.** If a component exists (check `scan-design-system`), instantiate
   and override — never redraw a lookalike frame. If the same subtree appears 2+ times and no
   component exists, create the component first, then place instances.
4. **Variables over hardcoded values.** Fills, radii, spacing, type sizes bind to variables via
   resolve-or-create (`create-variable` de-dups — `reused:true` is the expected common case).
   A hardcoded hex where a token exists is a defect, not a shortcut.
5. **Structure like a senior file.** Role-based names (`Header`, `Card/Product`, `Badge/Status`
   — never `Frame 427`), shallow purposeful nesting (wrapper frames earn their existence),
   experiments on `[FA ...]` pages, never on user pages.
6. **Fonts that exist.** Any Google font (e.g. Be Vietnam Pro) renders pixel-true; unmatched
   fonts (Helvetica) silently fall back, widen, and truncate. Load ALL fonts before any text
   edit (`figma.loadFontAsync`, per-range when `fontName === figma.mixed`).
7. **exec-js discipline.** Manifest is `dynamic-page`: always `*Async` APIs
   (`getNodeByIdAsync`, `setCurrentPageAsync`, `getLocalVariablesAsync`). Return JSON-safe
   values. Scope walks to the target frame, never the whole page.

## Decision ladder — which reference to read when

| You are about to... | Read |
|---|---|
| Lay anything out: rows/columns/grids, sizing (HUG/FILL/FIXED), wrap, min/max, overlays, constraints, responsive | `layout-mastery.md` |
| Create/choose components, variants, component properties, instances+overrides, variables/tokens/modes, styles-vs-variables | `components-variables-styles.md` |
| Name layers, organize pages/sections, decide nesting depth, clean up after a build | `structure-hygiene.md` |
| Apply color, type scale, effects (elevation/focus), radii, imagery — make it look designed | `visual-craft.md` |
| Build a KNOWN pattern (card list, nav bar, form, table, modal, badge, hero...) | `intent-recipes.md` — check here FIRST; a matching recipe beats first-principles |
| Critique/score what was built | run ease-design's critique gate — `templates/workflows/critique.md` + the `knowledge/taste-rubric.md` axes (vision + systemic passes); for Figma-node structural checks, use "Construction lints" below |

Order for a fresh screen: intent-recipes (pattern match) → layout-mastery (structure) →
components-variables-styles (reuse + tokens) → build → construction lints (below) →
critique loop.

## Build workflows

**A. Fresh screen — converter path (fastest for full screens):**
1. `scan-design-system --out ds.json` — know what components/variables exist BEFORE authoring.
2. Author HTML for the converter with its known limits in mind
   (`figma-agent-hand.md` recipe 4): span-wrap bare text with element siblings,
   no `position:absolute`, Google fonts only, badges may collapse — plan to rebuild them.
3. `html-to-figma --html screen.html --width 1440` → returns root id (+ warnings — read them).
4. Run construction lints (below); fix hits via targeted exec-js; rebuild known converter
   gaps (badge-collapse, absolute overlays) per `layout-mastery.md` §8.
5. `--replace <id>` on every re-render — iterate in place, never litter frames.

**B. Fresh component / small element — native path (more control):**
create-frame → set-autolayout → create-instance/set-text children → bind-variable each
themed property → lints. Prefer this path for anything that will become a component.

**C. Editing an existing design — read before you write:**
exec-js walk the target (name/type/size/layoutMode/gap/pad/fill-hex/radius/text/font,
depth-capped) + `export-png` it. Edit with the narrowest possible exec-js — targeted node
ids, never page-wide `findAll` mutations. Re-export, compare.

In ALL paths: experiments on a `[FA ...]` page; final artifacts moved/built where the user
asked.

## Overridable defaults — when to break the rules

These rules are strong defaults, not laws — a canvas-proven judgment call, not a hard
requirement. Legitimate overrides — state the reason in the layer name or a comment node:

- **Freeform art zones** (hero collage, illustration, map pins): `layoutMode NONE` +
  constraints is correct — see `layout-mastery.md` §10.
- **Table columns**: FIXED-width text cells are deliberate (column alignment beats HUG);
  never blanket-fix them (proven regression, `figma-agent-hand.md` recipe 3).
- **Pixel-matching a reference**: during a rebuild-to-parity loop, temporary hardcoded
  values are acceptable BETWEEN iterations — final frame must still pass the lints.

What is never overridable: missing fonts, thrown-away instances (detached copies of
existing components), default layer names on deliverables.

## Construction lints — run after EVERY build, before critique

One combined exec-js walk over the built frame checks all fourteen lints below in one
pass (same walker pattern used throughout this knowledge base). Fix hits via exec-js
(70–430ms per op, smoke-proven), then re-lint. These are construction-time checks — run
them before handing off to any taste critique (ease-design's critique gate, or a manual
visual review).

- **L1 absolute-soup** — no FRAME/COMPONENT/INSTANCE with >1 child and `layoutMode==='NONE'`.
- **L2 truncation-risk** — no single-line TEXT without `textAutoResize==='WIDTH_AND_HEIGHT'`; no `textTruncation==='ENDING'` you didn't choose.
- **L3 fixed-text-cells** — text-only containers (buttons/badges/pills) sized HUG, not FIXED (exception: table columns).
- **L4 off-grid-spacing** — every `itemSpacing`/`counterAxisSpacing`/`padding*` divisible by 4.
- **L5 stretch-audit** — every auto-layout child has DELIBERATE counter-axis sizing: no pill/badge/icon left at default STRETCH; fixed tiles report `layoutSizingHorizontal/Vertical === 'FIXED'` both axes.
- **L6 unbound-fills** — no solid fill without `boundVariables.fills` when a matching COLOR variable exists in file.
- **L7 lookalike-frames** — no plain frame named `Button|Badge|Card|Input|Chip...` when `scan-design-system` shows a matching component; must be an INSTANCE.
- **L8 stray-absolutes** — every `layoutPositioning==='ABSOLUTE'` child is a genuine overlay AND has constraints set (e.g. `{horizontal:'MAX', vertical:'MIN'}` for a top-right badge — see `intent-recipes.md` Recipe 14).
- **L9 default-names** — zero nodes matching `/^(Frame|Group|Rectangle|Ellipse|Component) \d+$/`.
- **L10 font-health** — zero `hasMissingFont`; font families ⊆ the intended stack (no silent fallback drift).
- **L11 radius-scale** — corner-radius census yields only scale values (0/4/8/12/16/999); a lone `7` is a defect.
- **L12 grid-legality** — GRID frames: never `setGridChildPosition` when `gridItemsPositioning==='ROW_AUTO_FLOW'` (throws); never set `gridRowCount` when `gridAutoTracks==='ROWS'` (throws — smoke-verified); no child anchored out of bounds.
- **L13 root-sizing** — top-level screen frame has deliberate sizing: FIXED width (device/breakpoint), FIXED or HUG height — never accidental HUG width on a screen.
- **L14 fill-in-hug** — no child set to FILL on an axis where the parent HUGs (degenerate cycle; pick which side owns the size — see `layout-mastery.md` §5).

Minimal harness (fill in predicates from the referenced files):

```bash
figma-agent exec-js - <<'EOF'
const root = await figma.getNodeByIdAsync('<BUILT_FRAME_ID>');
const hits = [];
const walk = (n) => { check(n); if ('children' in n) n.children.forEach(walk); };
// const check = (n) => { ...one lint predicate, or batch several... };
walk(root);
return hits.slice(0, 50);
EOF
```

## Golden intent-recipes index

`intent-recipes.md` maps UI intents → exact idiomatic constructions (the "given a
card list, a senior builds: VERTICAL, gap=spacing/md token, items = component instances,
FILL width" mappings). Check it before building any recognizable pattern; extend it whenever
a build teaches a new lesson (that is how this knowledge compounds).

Companion references (same directory): `layout-mastery.md` ·
`components-variables-styles.md` · `structure-hygiene.md` · `visual-craft.md`.

## Provenance

Live lessons (canvas-proven 2026-07-02): text truncation vs `WIDTH_AND_HEIGHT`,
counter-axis stretch default, variable de-dup `reused:true`, exec-js dynamic-page
discipline. API facts verified against https://developers.figma.com/docs/plugins/
(per-property citations inside each reference). Converter failure modes verified against
the same canvas-proven session.
