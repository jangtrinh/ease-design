# Layout Mastery — auto-layout, GRID, constraints, responsive

The deepest reference of `figma-craft`. Every rule: (a) principle, (b) when it applies,
(c) exact Plugin API / CLI to realize it, (d) provenance. API names verified against
https://developers.figma.com/docs/plugins/ (2026-07). Live lessons = canvas-proven
2026-07-02. Grid and CSS-mapping facts verified against the same canvas-proven session.

Contents: §1 core model · §2 layoutMode + construction order · §3 spacing/padding ·
§4 alignment · §5 sizing (THE truth table) · §6 min/max · §7 wrap · §8 absolute overlays ·
§9 GRID mode · §10 constraints · §11 responsive patterns · §12 nesting strategy.

---

## 1. Core model

- **Auto-layout frame = flexbox container.** `layoutMode: 'HORIZONTAL'` ≈ `flex-direction:
  row`, `'VERTICAL'` ≈ column, `'GRID'` ≈ CSS grid (explicit-only). Primary axis = flow
  direction; counter axis = perpendicular.
- **When:** every frame with >1 child that represents flow content (rows, stacks, lists,
  toolbars, cards, forms). `layoutMode: 'NONE'` with multiple children is a defect on
  anything we build (lint L1).
- **API:** `frame.layoutMode = 'VERTICAL'` — or CLI:
  `figma-agent set-autolayout --node <id> --mode V --gap 16 --pad 24,24,24,24`.
- **Provenance:** https://developers.figma.com/docs/plugins/api/FrameNode/ (property
  `layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'`).

**Construction order matters (gotchas, all throw or silently no-op if violated):**

1. Create/append the child into the parent FIRST, then set child sizing —
   `layoutSizingHorizontal = 'FILL'` is only valid on auto-layout *children*; on an orphan
   or a child of a plain frame it throws.
2. Set `layoutMode` on the parent BEFORE any `layoutSizing*` / `itemSpacing` / alignment —
   those properties are only applicable to auto-layout frames.
3. Setting `layoutMode` on an existing frame keeps children but re-flows them in child
   order — check order after conversion (`n.children.map(c => c.name)`), converter flip
   bug applies (see §4).
4. Prefer `layoutSizingHorizontal/Vertical` over `resize()` inside auto-layout — `resize()`
   on a HUG axis gets overridden on next reflow.

```js
// idiomatic frame construction, exec-js-ready
const card = figma.createFrame();
card.name = 'Card/Product';
parent.appendChild(card);                 // 1. parent first
card.layoutMode = 'VERTICAL';             // 2. mode before sizing
card.itemSpacing = 12;
card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 16;
card.layoutSizingHorizontal = 'FILL';     // 3. now legal (child of auto-layout)
card.layoutSizingVertical = 'HUG';
```

---

## 2. layoutMode — choosing the direction

| Intent | Mode | Why |
|---|---|---|
| Stack of sections, list, form | `VERTICAL` | reading order = flow order |
| Toolbar, icon+label, key-value row, button content | `HORIZONTAL` | inline flow |
| Card gallery, dashboard tiles, pricing columns | `GRID` (§9) or `HORIZONTAL`+`WRAP` (§7) | 2-D placement |
| Single child only | usually still auto-layout | free padding/HUG; flatten if wrapper adds nothing (§12) |

Rule: pick the mode that makes **spacing an axis property** (`itemSpacing`), never a set of
hand-measured x/y offsets. CSS mapping: `display:flex` row/column →
HORIZONTAL/VERTICAL; `gap` → `itemSpacing`; `justify-content` → `primaryAxisAlignItems`;
`align-items` → `counterAxisAlignItems`; `flex-wrap` → `layoutWrap`.

---

## 3. Spacing & padding

- **`itemSpacing: number`** — gap along the primary axis. One value per frame; if two gaps
  differ, you need a nested frame (§12), not manual offsets.
- **`counterAxisSpacing: number | null`** — gap BETWEEN WRAPPED ROWS/COLUMNS; only
  meaningful when `layoutWrap === 'WRAP'` (§7).
- **Per-side padding:** `paddingTop` / `paddingRight` / `paddingBottom` / `paddingLeft`,
  all `number`. CLI: `--pad t,r,b,l`.
- **When:** always — a frame with children touching its edges needs padding, not spacer
  rectangles. Spacer/divider rectangles used for spacing are a defect; real dividers
  (1px line) are content, spacing is `itemSpacing`.
- **4/8 discipline:** every spacing/padding value divisible by 4 (lint L4; off-grid values
  like 17/13/23 are converter measurement residue — snap them).
- **Margin-collapse trap:** CSS collapses adjacent margins, Figma does NOT —
  when converting HTML, `margin` that was collapsed becomes doubled gaps. Fix by choosing
  ONE source of gap (`itemSpacing`) and zeroing the notion of margins.
- **Provenance:** FrameNode page (above); the margin-collapse trap is canvas-proven from
  HTML-conversion testing.

```js
frame.itemSpacing = 16;
frame.paddingTop = 24; frame.paddingRight = 32;
frame.paddingBottom = 24; frame.paddingLeft = 32;
```

---

## 4. Alignment

- **`primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN'`** — packing along
  flow. `SPACE_BETWEEN` = the UI's "auto" gap: children pushed to the ends, space
  distributed; `itemSpacing` then acts only as the minimum/fallback (single child or
  not-enough-space cases) — don't rely on its exact px.
  - **When SPACE_BETWEEN:** header with logo-left/actions-right, list row with
    label-left/value-right, card footer. It replaces the "two nested groups + manual gap"
    anti-pattern — but ONLY for one-left-one-right (or evenly distributed) content; for
    "left cluster + right cluster" build two child frames and SPACE_BETWEEN them.
  - Converter trap: some HTML→Figma converters drop children under `space-between`
    entirely — verify visually after any conversion regardless of which converter produced it.
- **`counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE'`** — cross-axis
  alignment of all children.
  - **`BASELINE` restriction:** only settable on HORIZONTAL auto-layout frames; aligns
    children along the text baseline. Use for rows mixing font sizes (e.g. "$29" 32px +
    "/mo" 14px) — CENTER visibly misaligns mixed type; BASELINE is the senior move.
  - Default cross-axis behavior for children is STRETCH-like until child sizing is set —
    see §5, live lesson.
- **Provenance:**
  https://developers.figma.com/docs/plugins/api/properties/nodes-counteraxisalignitems/
  ("'BASELINE' ... can only be set on horizontal auto-layout frames"); FrameNode page for
  `primaryAxisAlignItems`.

```js
row.layoutMode = 'HORIZONTAL';
row.primaryAxisAlignItems = 'SPACE_BETWEEN';  // logo ⟷ actions
row.counterAxisAlignItems = 'CENTER';
price.counterAxisAlignItems = 'BASELINE';     // $29 /mo — horizontal frames only
```

---

## 5. Sizing — HUG / FILL / FIXED (the truth table)

Two API layers exist. **Use the ergonomic one:**

- **`layoutSizingHorizontal` / `layoutSizingVertical`: `'FIXED' | 'HUG' | 'FILL'`** — the
  setters that match the UI dropdown. Restrictions (quoted from docs): *"HUG is only valid
  on auto-layout frames and text nodes. FILL is only valid on auto-layout children."*
  Provenance:
  https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/
- Legacy granular layer (what `layoutSizing*` compiles down to): parent-side
  `primaryAxisSizingMode` / `counterAxisSizingMode: 'FIXED' | 'AUTO'` (AUTO = hug), child-side
  `layoutGrow: number` (1 = stretch along parent's PRIMARY axis) and `layoutAlign:
  'STRETCH' | 'INHERIT'` (counter axis). Read them when inspecting old files; write the
  ergonomic setters. Note `layoutSizing*` meaning is PER PARENT DIRECTION: FILL horizontal
  in a HORIZONTAL parent = `layoutGrow = 1`; in a VERTICAL parent = counter-axis stretch.

**Truth table — what actually stretches (per axis):**

| Child setting | Parent hugs this axis (`sizingMode AUTO`) | Parent fixed on this axis |
|---|---|---|
| `FIXED` | parent grows to content incl. this child | child keeps px; leftover space per alignment |
| `HUG` (frames/text only) | both shrink-wrap — correct for pills/badges/buttons | child shrink-wraps inside fixed parent |
| `FILL` | **degenerate — avoid** (lint L14): child wants parent's size, parent wants child's; Figma resolves it but the result is unstable across edits. Decide the owner: parent FIXED + child FILL, or child HUG + parent HUG | child stretches to share/claim free space — the responsive workhorse |

**Live lesson (ground truth, 2026-07-02):** children dropped into auto-layout containers get
counter-axis STRETCHED unless sizing is set explicitly.
- Pills / badges / buttons → `HUG` **both axes** (+ text child `WIDTH_AND_HEIGHT`, §below).
- Fixed tiles (40x40 step-number circles, icons, avatars) → `FIXED` both axes — the 40x40
  step-number bug was a tile silently stretched to row height.
- Never leave sizing at whatever the default landed on; lint L5 audits this.

**Text nodes couple into this system** via `textAutoResize: 'NONE' | 'WIDTH_AND_HEIGHT' |
'HEIGHT' | 'TRUNCATE'` (`TRUNCATE` deprecated → use `textTruncation`).
- Single-line text: `WIDTH_AND_HEIGHT` (= HUG both) — live lesson: fixed-box single-line
  text truncates when font metrics drift; matched Google fonts are pixel-true.
- Paragraph text: `HEIGHT` + `layoutSizingHorizontal = 'FILL'` (fixed width from parent,
  height follows content).
- Before ANY text edit: `await figma.loadFontAsync(...)` — per range if
  `fontName === figma.mixed`.
- Provenance:
  https://developers.figma.com/docs/plugins/api/properties/TextNode-textautoresize/
- ⚠️ Never blanket-apply `WIDTH_AND_HEIGHT` to table cells whose FIXED width defines the
  column (proven regression — `figma-agent-hand.md` recipe 3).

```js
// button: hug both axes
btn.layoutSizingHorizontal = 'HUG'; btn.layoutSizingVertical = 'HUG';
label.textAutoResize = 'WIDTH_AND_HEIGHT';
// icon tile: fixed both axes
tile.layoutSizingHorizontal = 'FIXED'; tile.layoutSizingVertical = 'FIXED';
tile.resize(40, 40);
// content column: fill width, hug height
col.layoutSizingHorizontal = 'FILL'; col.layoutSizingVertical = 'HUG';
```

CSS mapping: `width: 100%` → FILL · `width: auto`/`fit-content` → HUG ·
`width: 200px` / `flex: 0 0 200px` → FIXED + width · `flex: 1` → FILL on primary axis.

---

## 6. min/max width & height — clamps for FILL and HUG

- **`minWidth` / `maxWidth` / `minHeight` / `maxHeight`: `number | null`** (null = unset).
  Applicable to auto-layout frames and their direct children (matches the UI, where the
  min/max fields appear only in auto-layout contexts).
- **When:** every FILL that must not collapse or balloon — search field
  (`minWidth 200, maxWidth 480`), content column (`maxWidth 720`), card in a wrap grid
  (`minWidth 280` controls when wrapping happens). HUG + `maxWidth` = text card that grows
  then wraps.
- **API:** `node.minWidth = 280; node.maxWidth = 480;` — reset with `null`.
- **Provenance:** https://developers.figma.com/docs/plugins/api/FrameNode/ (minWidth /
  maxWidth / minHeight / maxHeight: `number | null`).

---

## 7. layoutWrap — flowing collections without GRID

- **`layoutWrap: 'NO_WRAP' | 'WRAP'`** — HORIZONTAL frames only (vertical wrap doesn't
  exist). Wrapped cross-axis gap = `counterAxisSpacing`; set it explicitly or rows
  visually collide.
- **`counterAxisAlignContent: 'AUTO' | 'SPACE_BETWEEN'`** — distribution of the wrapped
  tracks themselves. Docs: *"Changing this property on a non-wrapping auto-layout frame
  will throw an error"* — set `layoutWrap = 'WRAP'` first.
- **When:** tag clouds, chip rows, card collections with variable item widths. For uniform
  tracks and 2-D alignment, prefer GRID (§9). Grid→WRAP fallback trap: when degrading CSS
  grid to WRAP, copy `rowGap`/`columnGap` into `counterAxisSpacing`/`itemSpacing` BEFORE
  dropping grid data.
- **Provenance:** FrameNode page (`layoutWrap`);
  https://developers.figma.com/docs/plugins/api/properties/nodes-counteraxisaligncontent/

```js
chips.layoutMode = 'HORIZONTAL';
chips.layoutWrap = 'WRAP';
chips.itemSpacing = 8;            // gap within a row
chips.counterAxisSpacing = 8;     // gap between wrapped rows
```

---

## 8. layoutPositioning ABSOLUTE — overlays done right

- **`layoutPositioning: 'AUTO' | 'ABSOLUTE'`** — only on DIRECT children of auto-layout
  frames. ABSOLUTE removes the child from flow but keeps it nested, and — key fact —
  *"ABSOLUTE positioned nodes respect constraint settings"* relative to the parent frame.
- **When (whitelist):** notification badges, close buttons pinned to a corner, scrims,
  floating action buttons, decorative blobs behind content. Anything else absolute is
  lint L8 material. Converter bug: `position:absolute` children currently emit
  in-flow (badge beside the bell) — always rebuild these via exec-js.
- **Recipe (top-right badge that survives parent resize):**

```js
badge.layoutPositioning = 'ABSOLUTE';
badge.x = parent.width - badge.width + 4;  badge.y = -4;
badge.constraints = { horizontal: 'MAX', vertical: 'MIN' };  // pin top-right
```

- **Provenance:**
  https://developers.figma.com/docs/plugins/api/properties/nodes-layoutpositioning/ ·
  the top-right-badge fix pattern also appears in `intent-recipes.md` Recipe 14.

---

## 9. GRID mode — 2-D layout, explicit-only

`layoutMode: 'GRID'` — production since May 2025, ALL plans incl. Free. Model is
**EXPLICIT-only**: you declare counts and tracks; there is no CSS implicit grid.

**API surface (verified live docs + smoke test):**

| Property | Type / values | Notes |
|---|---|---|
| `gridRowCount` / `gridColumnCount` | number | can't shrink below occupied cells (throws) |
| `gridRowSizes` / `gridColumnSizes` | `GridTrackSize[]` | `{ type: 'FLEX' | 'FIXED' | 'HUG', value?: number }` — FLEX ≈ `fr`, FIXED = px, HUG ≈ `fit-content(100%)`; HUG track invalid when the container itself HUGs that axis. (An earlier audit pass also listed `FIXED_PERCENTAGE`/`AUTO` — NOT in current docs; probe with 1-line exec-js before relying on them.) |
| `gridRowGap` / `gridColumnGap` | number | maps 1:1 from CSS `gap` |
| `gridItemsPositioning` | `'MANUAL' | 'ROW_AUTO_FLOW'` | MANUAL (default) = children stay in placed cells; ROW_AUTO_FLOW = row-major auto-flow. (An earlier audit said "AUTO|MANUAL" — live docs supersede.) |
| child `gridRowAnchorIndex` / `gridColumnAnchorIndex` | number, 0-based | read placement |
| child `gridRowSpan` / `gridColumnSpan` | number | `grid-column: 2 / span 3` → columnAnchorIndex 1 + span 3 |
| `setGridChildPosition(child, rowIndex, columnIndex)` | method on the grid frame | **throws in ROW_AUTO_FLOW** — reorder with `insertChild` instead |
| `gridAutoTracks` | `'NONE' | 'ROWS'` | ROWS auto-creates row tracks as children flow. **Quirk (smoke-verified): with `'ROWS'`, setting `gridRowCount` THROWS.** |

Strict validation throughout: overlapping placements / out-of-bounds anchors THROW — no
silent clipping. Wrap grid mutations in try/catch inside exec-js and return the error.

```js
// 3-col card grid: repeat(3, 1fr) with 24px gaps
grid.layoutMode = 'GRID';
grid.gridColumnCount = 3;
grid.gridColumnSizes = [{type:'FLEX', value:1},{type:'FLEX', value:1},{type:'FLEX', value:1}];
grid.gridColumnGap = 24; grid.gridRowGap = 24;
grid.gridItemsPositioning = 'ROW_AUTO_FLOW';   // cards flow row-major
grid.gridAutoTracks = 'ROWS';                  // rows appear as needed
// (now do NOT touch gridRowCount — it throws)
```

CLI path: `figma-agent set-autolayout --node <id> --mode GRID --rows n --cols n --col-sizes ...`.

**CSS-grid fallback strategy (converter + hand-builds):**
- `repeat(3, 1fr)` → direct (count + FLEX tracks). ✅
- `grid-column: 2 / span 3` → anchorIndex 1 + span 3. ✅
- `auto-fill` / `auto-fit` / `minmax()` → NO equivalent → fixed count chosen for the target
  width + FLEX tracks, note the breakpoint intent in the layer description, or fall back to
  HORIZONTAL+WRAP with `minWidth` on items (§7) — preserve gaps first.
- Named areas / subgrid / `dense` → no equivalent → row-major placement + naming.
- **Provenance:** sources: developers.figma.com Update 115/120 docs, help.figma.com grid
  flow ·
  https://developers.figma.com/docs/plugins/api/GridTrackSize/ ·
  https://developers.figma.com/docs/plugins/api/properties/nodes-griditemspositioning/ ·
  live smoke, canvas-proven 2026-07-02 (GRID checklist).

---

## 10. Constraints — when auto-layout is NOT the answer

- **`node.constraints = { horizontal: ConstraintType, vertical: ConstraintType }`** with
  `'MIN' | 'MAX' | 'CENTER' | 'STRETCH' | 'SCALE'` (MIN = left/top, MAX = right/bottom,
  STRETCH = both edges pinned, SCALE = proportional). Groups/BooleanOperations have no
  constraints — their children carry them.
- **When constraints beat auto-layout:**
  1. ABSOLUTE overlays inside auto-layout (§8) — constraints are their positioning system.
  2. Freeform composition: hero illustrations, collage, map pins — content whose positions
     are design, not flow.
  3. Device mockup internals: STRETCH background + CENTER content on a fixed artboard.
  4. `SCALE` for artwork that must resize proportionally with the frame (logos, blobs).
- **Anti-pattern:** using constraints to fake a list/stack — that's flow content, lint L1.
- CLI: `figma-agent set-constraints --node <id> --h STRETCH --v MIN`.
- **Provenance:** https://developers.figma.com/docs/plugins/api/Constraints/ ·
  https://developers.figma.com/docs/plugins/api/properties/nodes-constraints/

---

## 11. Responsive patterns

1. **The FILL chain:** screen frame FIXED width (breakpoint) → sections
   `layoutSizingHorizontal='FILL'` → content column FILL + `maxWidth: 720` + CENTER —
   resize the screen frame and everything re-flows. Test responsiveness by literally
   resizing: `root.resize(768, root.height)` in exec-js, export-png, look.
2. **Clamped fills:** every FILL input/search/card gets min/max (§6) so extreme widths
   don't break it.
3. **Wrap-based response:** collections as HORIZONTAL+WRAP with item `minWidth` — column
   count emerges from available width (closest thing to `auto-fit`).
4. **Breakpoint variants:** true responsive artifacts = a COMPONENT SET with a
   `breakpoint` variant axis (`Desktop/Tablet/Mobile`), each variant re-using the same
   child components with different layout wrappers. Build per
   `components-variables-styles.md`; recipes in `intent-recipes.md`.
5. **SPACE_BETWEEN + FILL interplay:** navbar = FILL width + SPACE_BETWEEN children —
   grows gracefully at every breakpoint with zero extra work.

---

## 12. Nesting strategy — wrappers that earn their existence

**Add a wrapper frame when it provides:**
- a second gap value (row gap ≠ section gap → nested frame per §3);
- a different alignment for a subgroup (left cluster vs right cluster under SPACE_BETWEEN);
- shared background/padding/radius (the card surface IS the wrapper);
- an overlay coordinate space (parent of an ABSOLUTE child, §8);
- a semantic unit worth naming (`Card/Header`, `Form/Row`) — structure = documentation.

**Flatten (delete the wrapper) when:**
- single child, no padding/fill/effect of its own — pure passthrough (`div` soup from
  HTML conversion is the main source; hoist the child, keep the child's sizing);
- a "Group" is doing a frame's job — groups have no auto-layout, no padding, no
  constraints of their own; convert to frame or dissolve;
- two nested frames flow the SAME axis with compatible gaps — merge into one.

**Depth heuristic:** a screen reads `Screen → Section → Block → Element` (~4-6 levels).
Deeper usually = conversion residue; shallower = absolute soup. Audit cheaply:

```js
const depths = [];
const walk = (n, d) => { depths.push(d); if ('children' in n) n.children.forEach(c => walk(c, d+1)); };
walk(root, 0);
return { max: Math.max(...depths), avg: depths.reduce((a,b)=>a+b,0)/depths.length };
```

Naming and page organization rules live in `structure-hygiene.md`.

---

## Quick self-check before handing off a layout

L1 no absolute soup · L2 no truncation-risk text · L3 text containers HUG ·
L4 spacing %4 · L5 deliberate sizing on every child (stretch audit) ·
L8 absolutes are real overlays with constraints · L12 grid legality ·
L13 root sizing deliberate · L14 no FILL-inside-HUG. Full list + harness:
`figma-craft.md` → "Construction lints". Then run ease-design's critique gate
(`templates/workflows/critique.md` + `knowledge/taste-rubric.md`) with export-png
vision + structural passes.
