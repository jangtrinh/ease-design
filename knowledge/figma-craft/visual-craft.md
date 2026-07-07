# Visual Craft — Text, Fills, Effects, Vectors, Images on the Figma Canvas

Companion to `intent-recipes.md` (construction cookbook). This file = the raw-material
rules: how to make every text node, fill, stroke, shadow, vector, and image *correct by
construction*. Every rule: (a) principle, (b) when it applies, (c) exact Plugin API / CLI
call, (d) provenance.

Execution context: `figma-agent exec-js` runs your script as an **async function body** on
the plugin main thread with the `figma` global; manifest is `documentAccess: "dynamic-page"`
→ **always `*Async` getters** (`figma.getNodeByIdAsync`), never sync.
Lint alignment: `figma-craft.md`'s construction lints (L1–L14) plus ease-design's critique
gate (`templates/workflows/critique.md` + `knowledge/taste-rubric.md`) both check for
violations of these rules — build right here, lint there.

---

## 1. Text & Type System

### 1.1 loadFontAsync before ANY text mutation — non-negotiable

- **Principle:** every property that touches glyphs (`characters`, `fontSize`, `fontName`,
  `textAutoResize`, `textCase`, `textDecoration`, `textAlign*`, range setters) throws unless the
  font is loaded in the plugin first. Docs: "Setting this property requires the font to be loaded."
- **When:** always. New text: load the font you're about to assign. **Existing text: you don't know
  its fonts — enumerate them** with `getRangeAllFontNames(start, end): FontName[]` and load ALL
  (mixed-style nodes carry several).
- **API:**
  ```js
  // NEW text
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: 'Semi Bold' };
  t.characters = 'Save changes';

  // EXISTING text — the mandatory pre-edit loop (proven in smoke fixes, 73–78ms)
  const n = await figma.getNodeByIdAsync('123:45');
  for (const f of n.getRangeAllFontNames(0, n.characters.length))
    await figma.loadFontAsync(f);
  n.characters = 'New label';
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/TextNode/ ·
  https://developers.figma.com/docs/plugins/api/figma/ (`loadFontAsync(fontName): Promise<void>`) ·
  `figma-agent-hand.md` exec-js section.

### 1.2 Font choice: matched Google fonts are pixel-true; fallbacks drift

- **Principle:** fonts that exist in Figma (any Google font — Inter, Be Vietnam Pro…) render with
  exact metrics. Unmatched families (Helvetica) silently substitute and *widen*, causing truncation.
- **When:** picking any family; before blaming layout for clipped text, check the font first —
  font fallback drift is a common false lead.
- **API:** `figma.listAvailableFontsAsync()` to confirm availability; prefer the CLI's
  `set-text --font --size --weight` which runs a fallback chain.
- **Provenance:** canvas-proven live rebuild 2026-07-02 ("font metrics matched, no truncation
  on matched fonts") · `figma-agent-hand.md` recipe 2.

### 1.3 textAutoResize — pick the mode from intent, never default blindly

Allowed: `'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'`
(https://developers.figma.com/docs/plugins/api/TextNode/).

| Mode | WHEN | Why |
|---|---|---|
| `WIDTH_AND_HEIGHT` | **Every single-line label**: buttons, badges, nav items, table headers, stat labels | **Live lesson 1 (ground truth):** single-line text at fixed width truncates the moment font metrics drift. Hug both axes; let the parent HUG around it. |
| `HEIGHT` | Wrapping paragraphs/body copy with a **FIXED (or FILL) width** | Width is the design decision; height follows content. Set width first, then mode. |
| `NONE` | Fixed text box both axes | Almost never right for generated UI; only when a box must not move (rare). |
| `TRUNCATE` | Deliberate ellipsis only | Legacy value; prefer `textTruncation = 'ENDING'` (`'DISABLED' | 'ENDING'`) + `maxLines` intent. Never as an accident — `figma-craft.md`'s L2 truncation-risk lint flags `ENDING`/non-hugged single-line text. |

```js
label.textAutoResize = 'WIDTH_AND_HEIGHT';         // single-line label
para.resize(560, para.height); para.textAutoResize = 'HEIGHT';  // wrapping paragraph at 560px
cell.textTruncation = 'ENDING';                     // deliberate table-cell ellipsis ONLY
```
**Exception (live rebuild lesson):** NEVER blanket-apply `WIDTH_AND_HEIGHT` to table cells whose
fixed width defines the column — it collapses the column layout. See intent-recipes.md §Data table.

### 1.4 lineHeight & letterSpacing — unit objects, not bare numbers

- **Principle:** `LineHeight` = `{value, unit: 'PIXELS'|'PERCENT'}` or `{unit: 'AUTO'}`;
  `LetterSpacing` = `{value, unit: 'PIXELS'|'PERCENT'}`. Assigning a bare number throws.
- **When:** any type-scale application. PERCENT tracks the CSS mental model (150% ≈ 1.5 line-height).
- **API:**
  ```js
  t.lineHeight = { value: 150, unit: 'PERCENT' };      // body 1.5
  t.letterSpacing = { value: -2, unit: 'PERCENT' };    // display sizes, −0.02em
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/LineHeight/ · TextNode page.

### 1.5 Type-scale discipline

- **Principle:** every fontSize comes from the product's scale — never invented. Floor: **12px**.
  Reference shape (when no DS exists): 12/13/14/16/20/24/30 with LH 1.4→1.15 shrinking as size
  grows; weights 500 (labels) / 600 (buttons, subheads) / 700 (titles); one UI sans + one mono.
- **When:** all text. Role drift (13px vs 14px "same-role" titles) is a Typography lint hit.
- **Provenance:** canvas-proven type-scale reference from the source project's component
  vocabulary · role-drift is caught by the critique gate's Typography axis
  (`knowledge/taste-rubric.md`).

---

## 2. Fills & Strokes

### 2.1 SOLID fills — RGB 0–1, alpha lives in `opacity`

- **Principle:** `SolidPaint = { type:'SOLID', color:{r,g,b} }` with channels **0–1** (not 0–255);
  "This does not have an alpha property, use `opacity` instead."
- **When:** every flat fill. Bind a variable instead of hardcoding when the file has color tokens
  (`figma-craft.md`'s L6 unbound-fills lint is a hard requirement).
- **API:**
  ```js
  node.fills = [{ type: 'SOLID', color: { r: 0.31, g: 0.275, b: 0.898 } }];          // #4F46E5
  node.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.06 }];      // subtle border fill
  ```
  CLI: `create-variable --type COLOR --value "#4F46E5"` (de-dups, `reused:true`) then
  `bind-variable --node id --field fills --variable color/x`.
- **Provenance:** https://developers.figma.com/docs/plugins/api/Paint/ · `figma-agent-hand.md`.

### 2.2 Gradients — gradientStops + gradientTransform

- **Principle:** `GradientPaint = { type:'GRADIENT_LINEAR'|'GRADIENT_RADIAL'|'GRADIENT_ANGULAR'|
  'GRADIENT_DIAMOND', gradientStops: ColorStop[], gradientTransform: Transform }`. Stops carry RGBA
  (alpha inside the stop, unlike SOLID). `gradientTransform` is a 2×3 affine matrix positioning the
  gradient in the layer's unit square.
- **When:** button depth (subtle 2-stop gradients read premium), hero washes. NOT for the default
  purple-blue slop gradient (anti-slop lint).
- **Known-good transforms:** identity `[[1,0,0],[0,1,0]]` runs **left→right**;
  `[[0,1,0],[-1,0,1]]` runs **top→bottom** (90° rotation in gradient space).
  ```js
  btn.fills = [{
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [-1, 0, 1]],                       // vertical
    gradientStops: [
      { position: 0, color: { r: 0.898, g: 0.898, b: 0.898, a: 1 } }, // #E5E5E5
      { position: 1, color: { r: 0.886, g: 0.886, b: 0.886, a: 1 } }, // #E2E2E2
    ],
  }];
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/Paint/ · button-gradient pattern
  is canvas-proven practice from the source project's component vocabulary. (Converter note: CSS
  gradients survive html-to-figma cleanly — canvas-proven, 2026-07-02.)

### 2.3 Strokes — INSIDE for UI hairlines; per-side weights exist

- **Principle:** `strokeAlign: 'CENTER'|'INSIDE'|'OUTSIDE'`. UI borders are `INSIDE` so geometry
  (and auto-layout math) stays exact; `OUTSIDE` for focus rings that must not eat padding.
  Frames/rectangles also support **per-side weights**: `strokeTopWeight/strokeBottomWeight/
  strokeLeftWeight/strokeRightWeight` — the correct way to draw a bottom-only table-row border
  (no 1px divider rectangles).
- **API:**
  ```js
  card.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.06 }];
  card.strokeWeight = 1; card.strokeAlign = 'INSIDE';
  row.strokeBottomWeight = 1; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/FrameNode/ (strokeAlign, individual
  stroke weights) · border tiers are canvas-proven practice from the source component vocabulary.

### 2.4 Corner radii — per-corner + the concentric rule

- **Principle:** `cornerRadius` (uniform, reads `figma.mixed` when split) or per-corner
  `topLeftRadius/topRightRadius/bottomLeftRadius/bottomRightRadius`. Nesting law:
  **inner radius = outer radius − padding** (if padding ≥ outer radius → inner = 0). Violation is
  the #1 "AI-generated" tell on nested cards/thumbnails.
- **When:** any rounded container with rounded children (card → image, modal → buttons).
- **API:**
  ```js
  card.cornerRadius = 12;                 // radius token
  thumb.cornerRadius = Math.max(0, 12 - card.paddingTop);   // concentric: 12 − pad
  sheet.topLeftRadius = 16; sheet.topRightRadius = 16;      // bottom-sheet: top corners only
  pill.cornerRadius = 999;                                  // full pill
  ```
- **Provenance:** FrameNode page (property names) · the concentric-radius formula is canvas-proven
  practice from the source project's design methodology · `figma-craft.md`'s L11 radius-scale
  lint catches drift.

---

## 3. Effects With Intent

### 3.1 DROP_SHADOW — an elevation ladder, never one heavy drop

- **Principle:** shadows are a **named tier system mapped to component roles**, built by *stacking
  multiple* `DROP_SHADOW` entries in `effects[]` — rest states nearly invisible, elevation grows
  with interaction/height (card < popover < modal). The 11-tier taxonomy (toolbar, subtle,
  slight-hover, card-hover, input-focus, popover, modal, btn-primary/secondary/destructive,
  tab-active) should live in the project's own shadow/elevation tokens (see
  `knowledge/token-taxonomy.md`'s shadow primitives for the token model) — pick a tier from the
  project's token set, don't invent px values.
- **Shape:** `{ type:'DROP_SHADOW', color: RGBA, offset: {x,y}, radius, spread?, visible,
  blendMode, showShadowBehindNode? }`.
- **API (card rest tier — layered, near-invisible):**
  ```js
  card.effects = [
    { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a: 0.04 }, offset: { x:0, y:1 }, radius: 2,  spread: 0, visible: true, blendMode: 'NORMAL' },
    { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a: 0.03 }, offset: { x:0, y:4 }, radius: 8,  spread: -2, visible: true, blendMode: 'NORMAL' },
  ];
  ```
  `showShadowBehindNode: true` when the node has a translucent fill (frosted panels).
- **Provenance:** https://developers.figma.com/docs/plugins/api/Effect/ · tier system is
  canvas-proven practice from the source project's component vocabulary.

### 3.2 INNER_SHADOW — the inset highlight that makes buttons physical

- **Principle:** same fields as DROP_SHADOW with `type:'INNER_SHADOW'`. A 1px white inset from
  above (`offset {x:0,y:1}`, low-alpha white) simulates top light — the signature of premium
  buttons/inputs; tinted inner shadows for destructive buttons.
- **When:** btn-primary/secondary/destructive tiers, input-focus tier, tab-active.
- **API:**
  ```js
  btn.effects = [
    { type: 'INNER_SHADOW', color: { r:1, g:1, b:1, a: 0.6 }, offset: { x:0, y:1 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' },
    { type: 'DROP_SHADOW',  color: { r:0, g:0, b:0, a: 0.10 }, offset: { x:0, y:1 }, radius: 2, spread: 0, visible: true, blendMode: 'NORMAL' },
  ];
  ```
- **Provenance:** Effect page · canvas-proven practice ("gradient fills with inset highlights
  read as physical, premium buttons").

### 3.3 Blurs — LAYER_BLUR vs BACKGROUND_BLUR

- **Principle:** `type:'LAYER_BLUR'` blurs the node itself (rare in UI; decorative glows/orbs);
  `type:'BACKGROUND_BLUR'` blurs what's *behind* — frosted glass. BACKGROUND_BLUR only reads if the
  fill is semi-transparent.
- **API (frosted nav):**
  ```js
  nav.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.85 }];
  nav.effects = [{ type: 'BACKGROUND_BLUR', radius: 24, visible: true }];
  ```
- **Provenance:** Effect page (`'LAYER_BLUR' | 'BACKGROUND_BLUR'`, `blurType 'NORMAL'|'PROGRESSIVE'`) ·
  frosted nav surface pattern is canvas-proven practice.

### 3.4 Blend modes — sparingly

- **Principle:** node/paint `blendMode` (`'NORMAL'`, `'MULTIPLY'`, `'OVERLAY'`, …) is a photo/art
  tool, not a UI tool. Legit uses: `MULTIPLY` an image scrim, texture overlays. Anything else reads
  as accident; default stays `NORMAL`.
- **Provenance:** Paint/Effect pages (blendMode field).

---

## 4. Vector Work

### 4.1 Icons: `createNodeFromSvg` — our proven path

- **Principle:** `figma.createNodeFromSvg(svg: string): FrameNode` — "equivalent to the SVG import
  feature in the editor." Paste the icon's SVG markup (Lucide/Heroicons/Tabler), get a frame
  wrapping real vectors. Never rebuild icons from rectangles; never use emoji as icons.
- **When:** every icon. Resize the returned frame to the icon slot (16/20/24) and set it **FIXED**
  in auto-layout rows (live lesson 2 — otherwise it stretches).
- **API:**
  ```js
  const icon = figma.createNodeFromSvg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>...</svg>');
  icon.name = 'icon/bell'; icon.resize(20, 20);
  row.appendChild(icon);
  icon.layoutSizingHorizontal = 'FIXED'; icon.layoutSizingVertical = 'FIXED';
  // recolor: walk children, set vector fills/strokes to the token color
  for (const v of icon.findAll(c => c.type === 'VECTOR'))
    v.strokes = [{ type: 'SOLID', color: { r: 0.443, g: 0.443, b: 0.478 } }]; // text-secondary
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/figma/ (createNodeFromSvg) ·
  live lesson 2 (40×40 step-number stretch bug).

### 4.2 Boolean ops & flatten

- **Principle:** `figma.union / subtract / intersect / exclude (nodes, parent, index?) →
  BooleanOperationNode` build compound shapes non-destructively; `figma.flatten(nodes, parent?,
  index?) → VectorNode` bakes to one vector network (destructive — do last).
- **When:** custom marks/logos, cutouts (subtract a circle from a square), badge notches. Not for
  layout — containers are frames, always.
- **API:**
  ```js
  const ring = figma.subtract([outerCircle, innerCircle], page);   // donut
  const mark = figma.flatten([ring, bar], page);                   // single vector, one fill
  ```
- **Provenance:** figma global page (exact signatures quoted: "Creates a new BooleanOperationNode
  using the UNION operation…", "Flattens every node in nodes into a new vector network").

### 4.3 Masks — `isMask` on the FIRST sibling

- **Principle:** `node.isMask = true` makes a node "mask its **subsequent siblings**" — order
  matters: mask first, content after, all inside one group/frame. `maskType` defaults `'ALPHA'`.
- **When:** cropping an image to an odd shape, spotlight reveals. For plain rounded-rect crops,
  prefer `clipsContent: true` + cornerRadius on a frame, or an IMAGE fill (§5) — cheaper and
  editable.
- **API:**
  ```js
  const holder = figma.createFrame(); holder.resize(120, 120); holder.fills = [];
  const shape = figma.createEllipse(); shape.resize(120, 120); shape.isMask = true;
  holder.appendChild(shape); holder.appendChild(photo);   // photo AFTER the mask
  ```
- **Provenance:** https://developers.figma.com/docs/plugins/api/VectorNode/ (isMask: "A mask node
  masks its subsequent siblings"; maskType defaults ALPHA).

### 4.4 Vector vs frame — the decision line

Frame when it lays out children (auto-layout, padding, fills as background). Vector/boolean only
for *drawn shapes* (icons, marks, dividers with odd geometry). A "vector rectangle as card
background" breaks auto-layout, token binding, and the linter's hierarchy pass — never do it.

---

## 5. Images

### 5.1 Creating images — bytes or URL, then an IMAGE fill

- **Principle:** images are not nodes; they're **fills**. `figma.createImage(data: Uint8Array):
  Image` (raw bytes) or `await figma.createImageAsync(src: string): Promise<Image>` (URL — subject
  to manifest `networkAccess`; the CLI inlines external images to data URIs before sending). Apply
  via `ImagePaint { type:'IMAGE', imageHash, scaleMode }`.
- **API:**
  ```js
  const img = await figma.createImageAsync('data:image/png;base64,...');   // or figma.createImage(bytes)
  const holder = figma.createRectangle(); holder.resize(320, 180); holder.cornerRadius = 8;
  holder.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
  ```
- **Provenance:** figma global page (`createImage(data: Uint8Array): Image`,
  `createImageAsync(src: string): Promise<Image>`) · Paint page (ImagePaint) · manifest note:
  canvas-proven, 2026-07-02.

### 5.2 scaleMode — `'FILL' | 'FIT' | 'CROP' | 'TILE'`

| Mode | WHEN |
|---|---|
| `FILL` | Default for UI: avatars, card covers, heroes — covers the box, crops overflow (CSS `object-fit: cover`). |
| `FIT` | Logos, product shots that must never crop (CSS `contain`) — pair with a bg fill behind. |
| `CROP` | Art-directed crop via `imageTransform` — only when you control the focal point. |
| `TILE` | Patterns/textures; `scalingFactor` sets tile size. |

Never stretch: there is no "STRETCH" — if proportions look wrong, the box ratio is wrong, fix the
frame not the image. **Provenance:** https://developers.figma.com/docs/plugins/api/Paint/.

### 5.3 Placeholder discipline

No dead gray boxes in finished frames (anti-slop lint): use a real image fill, or a deliberate
empty-state pattern (intent-recipes.md §Empty state) with a tinted bg + icon.

---

## Cross-references

- Construction recipes (button/card/table/modal…): `intent-recipes.md` (same folder)
- Lint/verify pass: `figma-craft.md`'s construction lints (L1–L14) for structure; ease-design's
  critique gate (`templates/workflows/critique.md` + `knowledge/taste-rubric.md`) for taste —
  truncation → L2, HUG discipline → recipes, font health → L10, absolute badges → L8
- Tokens & tiers to draw values from: the project's own design-system tokens
  (`knowledge/token-taxonomy.md`)
- CLI surface + exec-js semantics: `figma-agent-hand.md`
