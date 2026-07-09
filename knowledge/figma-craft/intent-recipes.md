# Intent Recipes — UI Intent → Idiomatic Figma Construction

> The cookbook. Each recipe maps a UI intent to the EXACT node tree + sizing + API calls a senior
> designer's file would contain. Raw-material rules (fonts, fills, shadows, vectors, images) live
> in `visual-craft.md`; this file is pure construction.
>
> Conventions used below:
> - `FA="node <path-to-figma-design-agent>/cli/<built-cli>.js"` — the figma-agent CLI ships in
>   the separate figma-design-agent repo (see `figma-agent-hand.md` for setup + the scout-block
>   workaround).
> - exec-js snippets are async-function bodies (`figma` global, `return` = reply, all `*Async`).
> - Token values (radius 12, gap 16, pad 24…) are EXAMPLE values — resolve from the product's
>   design system first (`scan-design-system`), invent nothing.
>
> ## The two iron laws (live-verified 2026-07-02 — every recipe obeys them)
>
> 1. **Sizing is explicit or it's wrong.** Children of auto-layout frames get STRETCHED on the
>    counter axis unless you set sizing. Pills/badges/buttons **HUG**; icons/avatars/fixed tiles
>    **FIXED**; cards in grids / inputs / table cells **FILL** (or deliberate FIXED). API order
>    matters: `appendChild` FIRST, then `layoutSizingHorizontal/Vertical` — `'FILL'` is only valid
>    on auto-layout children, `'HUG'` only on auto-layout frames & text
>    (https://developers.figma.com/docs/plugins/api/FrameNode/).
> 2. **Single-line text HUGS** (`textAutoResize = 'WIDTH_AND_HEIGHT'`) and its fonts are loaded
>    before any mutation (`getRangeAllFontNames` loop) — see visual-craft.md §1.1/§1.3.
>    Exception: fixed-width table cells (Recipe 9).

Helper used in snippets (paste once per script):

```js
const loadFonts = async (n) => {
  for (const f of n.getRangeAllFontNames(0, n.characters.length)) await figma.loadFontAsync(f);
};
const S = (n, h, v) => { n.layoutSizingHorizontal = h; n.layoutSizingVertical = v; }; // after append!
```

---

## 1. Button

```
Frame "btn/primary"  H · HUG×HUG · pad 12/20 · gap 8 · CENTER/CENTER · radius 14 (token)
└── Text "label"     13/600 · WIDTH_AND_HEIGHT     [+ optional icon 16 FIXED before/after]
```

```js
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
const btn = figma.createFrame(); btn.name = 'btn/primary';
btn.layoutMode = 'HORIZONTAL'; btn.itemSpacing = 8;
btn.paddingTop = btn.paddingBottom = 12; btn.paddingLeft = btn.paddingRight = 20;
btn.primaryAxisAlignItems = 'CENTER'; btn.counterAxisAlignItems = 'CENTER';
btn.cornerRadius = 14;
btn.fills = [{ type: 'SOLID', color: { r: 0.31, g: 0.275, b: 0.898 } }]; // bind token instead
const label = figma.createText();
label.fontName = { family: 'Inter', style: 'Semi Bold' }; label.fontSize = 13;
label.characters = 'Save changes'; label.textAutoResize = 'WIDTH_AND_HEIGHT';
label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
btn.appendChild(label);
parent.appendChild(btn); S(btn, 'HUG', 'HUG');       // iron law 1 — the smoke-test fix pair
return btn.id;
```

Height lands ≈44px (13px text + 12/12 pad) — Fitts-compliant. Never FIXED-width a button
(lint L3). Depth: btn tier shadows + inset highlight, visual-craft.md §3.1–3.2.

## 2. Badge / pill

```
Frame "badge/active"  H · HUG×HUG · pad 2/8 · gap 4 · CENTER · radius 999 · fill pale tint
└── Text "ACTIVE"     11/600 · uppercase · WIDTH_AND_HEIGHT · deep same-hue text
```

```js
const pill = figma.createFrame(); pill.name = 'badge/active';
pill.layoutMode = 'HORIZONTAL'; pill.itemSpacing = 4;
pill.paddingTop = pill.paddingBottom = 2; pill.paddingLeft = pill.paddingRight = 8;
pill.counterAxisAlignItems = 'CENTER'; pill.cornerRadius = 999;
pill.fills = [{ type: 'SOLID', color: { r: 0.91, g: 0.96, b: 0.91 } }];   // pale green #E8F5E9
const t = figma.createText(); await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
t.fontName = { family: 'Inter', style: 'Semi Bold' }; t.fontSize = 11;
t.characters = 'ACTIVE'; t.textCase = 'UPPER'; t.textAutoResize = 'WIDTH_AND_HEIGHT';
t.fills = [{ type: 'SOLID', color: { r: 0.18, g: 0.49, b: 0.20 } }];      // deep green #2E7D32
pill.appendChild(t); row.appendChild(pill); S(pill, 'HUG', 'HUG');
```

Pale-bg + dark-saturated-text same hue (visual-craft.md's component-vocabulary tier system).
This is also the fix for a known converter defect — it can collapse inline badge spans into
bare text; rebuild exactly this.

## 3. Icon + label row

```
Frame "nav-item"  H · gap 8 · counterAxis CENTER · HUG×HUG (or FILL×HUG in a sidebar)
├── Frame "icon/..."  20×20 FIXED×FIXED   (createNodeFromSvg — visual-craft.md §4.1)
└── Text "label"      WIDTH_AND_HEIGHT
```

```js
const row = figma.createFrame(); row.layoutMode = 'HORIZONTAL';
row.itemSpacing = 8; row.counterAxisAlignItems = 'CENTER'; row.fills = [];
const icon = figma.createNodeFromSvg(SVG); icon.resize(20, 20);
row.appendChild(icon); S(icon, 'FIXED', 'FIXED');    // never let the icon stretch
row.appendChild(label);                               // label from Recipe 1 pattern
sidebar.appendChild(row); S(row, 'FILL', 'HUG');
```

Order trap: if built via html-to-figma, span-wrap bare text or icon/label may flip; fix with
`row.insertChild(0, icon)`.

## 4. Card

```
Frame "card"  V · pad 16 · gap 12 · radius 12 · fill surface · stroke subtle INSIDE · shadow tier "subtle"
├── (optional) Rect "cover"  FILL×FIXED 160 · IMAGE fill FILL · radius = 12 − pad (concentric!)
├── Text "title"   16/600 · WIDTH_AND_HEIGHT (short) or FILL + HEIGHT (may wrap)
├── Text "body"    13/400 · FILL×HUG · textAutoResize HEIGHT
└── Frame "footer" H · FILL×HUG · SPACE_BETWEEN · counter CENTER
```

```js
const card = figma.createFrame(); card.name = 'card';
card.layoutMode = 'VERTICAL'; card.itemSpacing = 12;
card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 16;
card.cornerRadius = 12; card.clipsContent = true;
card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
card.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.06 }];
card.strokeWeight = 1; card.strokeAlign = 'INSIDE';
grid.appendChild(card); S(card, 'FILL', 'HUG');       // FILL width in grid, height hugs content
body.textAutoResize = 'HEIGHT';                        // after width is FILL
```

In a grid: width FILL (track decides), height HUG (content decides) — equal-width, content-tall
cards. Standalone: FIXED width, HUG height.

## 5. Card grid — H-wrap vs GRID mode

**Choose H-wrap** (`layoutMode 'HORIZONTAL'` + `layoutWrap 'WRAP'`) when cards are uniform and the
count is open-ended (galleries, search results). **Choose GRID** (`layoutMode 'GRID'`, explicit
tracks — production since May 2025, all plans incl. Free) when rows/columns must align strictly or
cells span (dashboards, 12-col layouts). Figma GRID is **explicit-only** — no auto-fill/minmax
(canvas-proven audit, 2026-07-02).

```js
// H-wrap
grid.layoutMode = 'HORIZONTAL'; grid.layoutWrap = 'WRAP';
grid.itemSpacing = 16; grid.counterAxisSpacing = 16;   // counterAxisSpacing = gap between tracks
// GRID — 3 equal columns
grid.layoutMode = 'GRID';
grid.gridColumnCount = 3; grid.gridColumnGap = 16; grid.gridRowGap = 16;
// spans (0-based anchors): featured.gridColumnSpan = 2;
```
```bash
$FA set-autolayout --node <id> --mode GRID --cols 3 --gap 16
```

Quirks (smoke-verified): `gridAutoTracks:'ROWS'` locks the `gridRowCount` setter (THROWS); strict
overlap/bounds validation. Track types: FIXED px · FLEX fr · FIXED_PERCENTAGE · AUTO · HUG.

## 6. Nav sidebar

```
Frame "sidebar"  V · FIXED 260 × FILL-height · pad 16/12 · SPACE_BETWEEN · fill nav-surface
├── Frame "top"    V · FILL×HUG · gap 4   → logo row + nav items (Recipe 3, each FILL×HUG)
└── Frame "bottom" V · FILL×HUG · gap 4   → settings, user row
```

SPACE_BETWEEN on the **sidebar** pushes the bottom group down; grouping into top/bottom frames is
what makes it work (SPACE_BETWEEN distributes *children*, so exactly two children = pinned ends).
Note: with SPACE_BETWEEN, `itemSpacing` is ignored — internal gaps live inside the groups.

```js
side.layoutMode = 'VERTICAL'; side.primaryAxisAlignItems = 'SPACE_BETWEEN';
side.paddingTop = side.paddingBottom = 16; side.paddingLeft = side.paddingRight = 12;
shell.appendChild(side); S(side, 'FIXED', 'FILL'); side.resize(260, side.height);
```

## 7. Top bar

```
Frame "topbar"  H · FILL×HUG (or FIXED 64) · pad 12/24 · SPACE_BETWEEN · counter CENTER
├── Frame "left"   H · gap 12 · CENTER · HUG   → breadcrumb / page title
└── Frame "right"  H · gap 8  · CENTER · HUG   → search, bell (Recipe 14), avatar (Recipe 13)
```

```js
bar.layoutMode = 'HORIZONTAL';
bar.primaryAxisAlignItems = 'SPACE_BETWEEN'; bar.counterAxisAlignItems = 'CENTER';
bar.paddingLeft = bar.paddingRight = 24; bar.paddingTop = bar.paddingBottom = 12;
main.appendChild(bar); S(bar, 'FILL', 'HUG');
```

counterAxis CENTER is what keeps title, icons, avatar on one optical line — never eyeball-nudge y.

## 8. Form field

```
Frame "field"  V · gap 6 · FILL×HUG
├── Text "label"   13/500 · WIDTH_AND_HEIGHT
├── Frame "input"  H · FILL×HUG · pad 10/12 · radius 8 · fill surface · stroke light INSIDE · counter CENTER
│   └── Text "placeholder"  14/400 muted · WIDTH_AND_HEIGHT   [+ trailing icon 16 FIXED]
└── (optional) Text "help/error"  12/400 · FILL + HEIGHT
```

```js
const field = figma.createFrame(); field.layoutMode = 'VERTICAL'; field.itemSpacing = 6; field.fills = [];
const input = figma.createFrame(); input.layoutMode = 'HORIZONTAL';
input.paddingTop = input.paddingBottom = 10; input.paddingLeft = input.paddingRight = 12;
input.counterAxisAlignItems = 'CENTER'; input.cornerRadius = 8;
input.strokes = [{ type: 'SOLID', color: { r: 0.894, g: 0.894, b: 0.906 } }]; // #E4E4E7
input.strokeWeight = 1; input.strokeAlign = 'INSIDE';
field.appendChild(labelText); field.appendChild(input);
form.appendChild(field); S(field, 'FILL', 'HUG'); S(input, 'FILL', 'HUG');
```

Gap discipline: label→own input 6px, field→next field 16–20px (proximity law — label must sit
closer to its own input than to the field above; lint §4).

## 9. Data table — fixed columns, NOT hugged (live rebuild lesson)

```
Frame "table"  V · gap 0 · FILL×HUG · radius 8 · clipsContent · stroke subtle
├── Frame "row/header"  H · FILL×HUG · pad 10/16 · gap 16 · fill #FAFAFA · strokeBottomWeight 1
│   ├── Text "NAME"    FIXED 240 (col spec) · 12/600 muted
│   ├── Text "STATUS"  FIXED 120
│   └── Text "AMOUNT"  FILL · textAlignHorizontal RIGHT
└── Frame "row" ×N     H · FILL×HUG · pad 12/16 · gap 16 · counter CENTER · strokeBottomWeight 1
    ├── Text cell      FIXED 240 · textTruncation 'ENDING' (deliberate)
    ├── Badge (Recipe 2, HUG) inside FIXED-120 cell frame
    └── Text cell      FILL · RIGHT
```

**Column strategy — the one place text does NOT hug:** columns align because every row gives the
same slot the same FIXED width. Blanket `WIDTH_AND_HEIGHT` on cells collapses the columns
(verified during a live screen-rebuild proof case — see `figma-agent-hand.md` recipe 3 warning;
`figma-craft.md`'s L3 fixed-text-cells lint has an explicit exception for this). Overflow inside a
fixed cell = deliberate `textTruncation = 'ENDING'`.

```js
// per row:
row.layoutMode = 'HORIZONTAL'; row.itemSpacing = 16; row.counterAxisAlignItems = 'CENTER';
row.paddingTop = row.paddingBottom = 12; row.paddingLeft = row.paddingRight = 16;
row.strokeBottomWeight = 1; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
row.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.06 }];
table.appendChild(row); S(row, 'FILL', 'HUG');
row.appendChild(nameCell); S(nameCell, 'FIXED', 'HUG'); nameCell.resize(240, nameCell.height);
row.appendChild(amountCell); S(amountCell, 'FILL', 'HUG'); amountCell.textAlignHorizontal = 'RIGHT';
```

Per-side border via `strokeBottomWeight` — no 1px divider rectangles (visual-craft.md §2.3).

## 10. Modal / dialog

```
Frame "modal-overlay"  ABSOLUTE over screen · x0 y0 · w×h = screen · fill rgba(0,0,0,0.4)
│                      V · primary CENTER · counter CENTER      ← auto-layout centers the card
└── Frame "modal"      V · FIXED 480 × HUG · pad 24 · gap 16 · radius 16 · shadow tier "modal"
    ├── Frame "header" H · FILL · SPACE_BETWEEN · CENTER  → title 20/600 + close icon-btn
    ├── Text "body"    FILL + HEIGHT
    └── Frame "footer" H · FILL · primary MAX · gap 8     → ghost + primary buttons (Recipe 1)
```

```js
const ov = figma.createFrame(); ov.name = 'modal-overlay';
screen.appendChild(ov);
ov.layoutPositioning = 'ABSOLUTE';                       // out of the screen's flow
ov.x = 0; ov.y = 0; ov.resize(screen.width, screen.height);
ov.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
ov.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.4 }];
ov.layoutMode = 'VERTICAL';                              // the overlay ITSELF centers the card
ov.primaryAxisAlignItems = 'CENTER'; ov.counterAxisAlignItems = 'CENTER';
ov.appendChild(modal); S(modal, 'FIXED', 'HUG'); modal.resize(480, modal.height);
```

`layoutPositioning: 'ABSOLUTE'` requires the parent to be auto-layout
(https://developers.figma.com/docs/plugins/api/FrameNode/). Scrim + elevation separate the modal
from the ground. Converter never emits this (absolute-positioning is a known converter gap) —
always build modals natively.

## 11. Hero section

```
Frame "hero"  V · FILL×HUG · pad 96/24 · gap 24 · primary CENTER · counter CENTER
├── Badge "announcement" (Recipe 2)
├── Text "headline"  48/700 · LH 1.15 · LS −2% · CENTER · FIXED maxWidth ~760 + HEIGHT
├── Text "subcopy"   16/400 secondary · CENTER · FIXED ~560 + HEIGHT
└── Frame "cta-row"  H · gap 12 · HUG   → primary + ghost buttons
```

Headline gets a width cap (`resize(760, h)` + `textAutoResize='HEIGHT'`, or `maxWidth = 760` with
FILL) — full-bleed hero text lines are unreadable. Center via the container's aligns AND
`textAlignHorizontal = 'CENTER'` — both, or wrapped lines left-align inside a centered box.

## 12. Stats row — BASELINE alignment

```
Frame "stats"  H · FILL×HUG · gap 32 · counterAxisAlignItems BASELINE
└── Frame "stat" ×4  V · gap 4 · HUG (or FILL for equal spread)
    ├── Text "value"  30/700 · WIDTH_AND_HEIGHT
    └── Text "label"  13/400 muted · WIDTH_AND_HEIGHT
```

`counterAxisAlignItems: 'BASELINE'` (horizontal auto-layout only) sits mixed-size numerals on one
optical line — the difference between "$1.2M" and "48" looking aligned vs floating. CENTER-aligning
mixed font sizes is a staggered-baseline defect worth catching in review.

```js
stats.layoutMode = 'HORIZONTAL'; stats.itemSpacing = 32;
stats.counterAxisAlignItems = 'BASELINE';   // FrameNode: 'MIN'|'MAX'|'CENTER'|'BASELINE'
```

## 13. Avatar

```
Frame "avatar"  32×32 FIXED×FIXED · radius 999 · clipsContent
└── image fill (scaleMode FILL)   — or —   V·CENTER·CENTER + Text "initials" 13/600
```

```js
const av = figma.createFrame(); av.name = 'avatar'; av.resize(32, 32);
av.cornerRadius = 999; av.clipsContent = true;
// photo variant:
av.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
// initials variant:
av.layoutMode = 'VERTICAL'; av.primaryAxisAlignItems = 'CENTER'; av.counterAxisAlignItems = 'CENTER';
av.fills = [{ type: 'SOLID', color: { r: 0.89, g: 0.91, b: 0.94 } }]; av.appendChild(initialsText);
bar.appendChild(av); S(av, 'FIXED', 'FIXED');       // iron law 1 — same class as the 40×40 tile bug
```

Stacked avatars: negative `itemSpacing` (e.g. −8) on the containing H frame + 2px surface-color
stroke per avatar for separation.

## 14. Notification badge on icon — the bell-badge fix

```
Frame "icon-btn"  H · 36×36 FIXED · CENTER/CENTER · radius 8
├── Frame "icon/bell"  20×20 FIXED (SVG)
└── Frame "badge"      ABSOLUTE · top-right · HUG · min 16×16 · radius 999 · fill error token
    └── Text "3"  10/600 white · WIDTH_AND_HEIGHT
```

Some HTML→Figma converters render `position:absolute` children **beside** the bell instead of
overlaying it — a known converter gap. Correct construction — overlay via `layoutPositioning`:

```js
const badge = figma.createFrame(); badge.name = 'badge';
badge.layoutMode = 'HORIZONTAL'; badge.counterAxisAlignItems = 'CENTER';
badge.paddingLeft = badge.paddingRight = 4; badge.minWidth = 16; badge.minHeight = 16;
badge.cornerRadius = 999;
badge.fills = [{ type: 'SOLID', color: { r: 0.996, g: 0.35, b: 0.22 } }];  // error token
badge.appendChild(countText);
iconBtn.appendChild(badge);                       // parent MUST be auto-layout
badge.layoutPositioning = 'ABSOLUTE';             // out of flow, overlaps siblings
badge.x = iconBtn.width - badge.width + 4; badge.y = -4;
badge.constraints = { horizontal: 'MAX', vertical: 'MIN' };   // pins top-right on resize
```

Same pattern as the absolute-overlay badge fix above: status dots on avatars, "NEW" ribbons on
cards, floating action buttons.

## 15. Empty state

```
Frame "empty"  V · FILL×FILL (fills the void it explains) · primary CENTER · counter CENTER · gap 16 · pad 48
├── Frame "glyph"   48×48 FIXED — icon SVG on a pale tinted circle (radius 999), NOT a gray box
├── Text "title"    16/600 · WIDTH_AND_HEIGHT           ("No projects yet")
├── Text "body"     13/400 secondary · CENTER · FIXED ~320 + HEIGHT  (say what to DO next)
└── Button (Recipe 1) — the ONE next action
```

One CTA, not three (Hick's-law lint); real copy, not lorem (anti-slop). The body width cap
(~320px) keeps the message a readable two-liner.

---

## 15. Rebuild a live website on the canvas (with behavior)

Not "screenshot → trace". Copy the site's **structure, animation, interaction, and state** —
everything, not the pixels only. The loop is capture → convert → author behavior → verify.

```
1. CAPTURE   FA capture <url>                     → <slug>/capture/{manifest.json, behavior.json, page.html, assets/, screenshots/}
2. CONVERT   html-to-figma <slug>/capture/page.html  → auto-layout tree (bg-image fills, fonts, ::before/::after all wired)
3. INTERACT  behavior.json states  → variant sets + ON_HOVER Smart-Animate reactions (executor-components)
4. ANIMATE   behavior.json keyframes → Figma Motion tracks, metronome-gated (executor-motion)
5. VERIFY    export-png (resting) + export-video (motion) → critique-rubric → fix-loop
```

**Editable-vs-image heuristic — decide per node BEFORE building:**

| Signal | Build as | Why |
|---|---|---|
| Structured DOM: nav, cards, grids, forms, headings | **Rebuild** (auto-layout + text + variants) | It's a layout — editable, token-bindable, respects the two iron laws |
| Baked artwork: hero illustrations, logos, WebGL/Canvas scenes, Lottie | **Image** (place the captured asset) | Rebuilding vaporizes fidelity; `manifest.canvases[]`/`videos[]` already hold the pixels |
| Content photos (`<img>`, product shots) | **Image** — prefer the real `<img>`/`currentSrc` | Higher fidelity than a bg-image fill; use `manifest.images[].currentSrc` |
| Decorative CSS `background-image` (textures, gradients-as-image) | **bg-image fill** (now supported, Commit 1) | Cheap, on-node; `background-size` maps to scaleMode (cover→FILL, contain→FIT) |

> bg-image data-URIs now paint as real IMAGE fills — the old blank-background gap is closed.
> Still prefer a true `<img>` node for content photography (crisper, independently movable).

**Motion mapping (→ `../motion-craft.md` T1–T6):** capture reads the **T1** layer — CSS
transitions + `@keyframes` — which is where hover/focus/entrances/carousels live. On the canvas:
- hover/focus **state deltas** → Smart-Animate **variant reactions** (4a).
- scroll-reveal / autoplay-carousel / infinite loops → Figma **Motion timelines** (4b), gated on
  the metronome probe; if Motion is unavailable, fall back to the variant reaction.
- **T4–T6** (Motion/GSAP/anime.js libs, Lottie, WebGL) are captured motions we do **not** rebuild —
  they're baked artwork by the heuristic above; carry the asset, don't reverse-engineer the tween.

`behavior.json` carries `carousels[].autoplayMs` + `slideTransition`, `keyframes`, per-element
`transitions`/`animations`/`states`, and `timers` — read it, don't re-derive the motion by eye.

---

## 16. Learn conventions from real screens (C7 — companion to C0 onboarding)

C0 (`ui ingest-figma-ds`) captures the DS **vocabulary** (tokens/components). This captures the
**grammar** — how screens actually use it, as measured DO/DON'T house style.

1. Bridge via the seat-adaptive selector.
2. Distill usage DNA **in-plugin** (never MCP-dump a section — see `figma-agent-hand.md`
   §"Reading a whole section", ≈85× cheaper):
   `figma-agent scan-conventions <sectionId…> --out usage-dna.json`
   → per section: token-binding %, auto-layout %, radius/spacing histograms, component + font counts.
3. Synthesize (deterministic, zero-token):
   `ui synthesize-conventions usage-dna.json --ds tokens.json --out . --seed-memory`
   → `CONVENTIONS.md` — **DO** = the dominant pattern; **DON'T** = off-grid spacing / off-scale
   radius / raw-unbound fills / stray fonts / deprecated-in-use, cross-referenced to the DS so valid
   tokens are NOT flagged — plus `ui memory` prefers/avoids insights.
4. The DON'Ts become `/ui:audit` convention rules; the profile grounds `/ui:generate` in the house style.

Onboarding is complete only with BOTH: C0 (vocabulary) + C7 (grammar).

---

## 17. Component-state board (C2 — show a component's grammar)

Given a `COMPONENT_SET` with variant axes, author a labeled matrix of every state combination as
**real instances** (not a mockup) — the "component-state demo" a designer asks for. Proven live.

**Plan (deterministic):**
- Read `set.variantGroupProperties` → axes `{name: values}`.
- **Column axis** = the state-like axis (`/state|status/i`), else the first axis.
- **Rows** = cartesian product of the remaining axes; each cell = `{…rowCombo, [colAxis]: colVal}`.
- Cell content = the child `COMPONENT` whose `variantProperties` match → `child.createInstance()`.

**Author (hand, exec-js):**
- Board = auto-layout VERTICAL: title + header row (row-axis label + one label per column value) +
  N rows (row-combo label + one instance cell per column value).
- Labels: `loadFontAsync` FIRST (Inter is always safe); `createText` → set `fontName` before `characters`.
- Place in a **fresh empty spot** — past real content's max-x, or a scratch/Archive page — never overlap real work.
- Verify: `export-png` → Read → the matrix reads as the component's state grammar.

Instances stay linked to the component, so the board updates when the component changes. Optionally
embed the board beside the host screen it documents. Pairs with the captured hover/focus states from
`from-url` (Track 5) when the "component" is a rebuilt web element rather than a Figma component set.

---

## 18. Build a screen from real DS instances (C6 — J1 core)

Author a NEW screen by composing **real instances** of the onboarded DS components (never flat frames) —
the discipline that makes "rebuild a screen" a design-system workflow, not a mockup. Proven live.

- **Instantiate:** `const comp = set.type==='COMPONENT_SET' ? set.defaultVariant : set; const i = comp.createInstance();`
  Look components up by NAME in the onboarded `component-registry.json` (C0); resolve the node id via the
  registry/scan — ids drift (`canvas-operations.md` R2), names don't.
- **Set variants:** `i.setProperties({ Variant:'primary', Size:'default' })` — exact axis names + values (from
  `set.variantGroupProperties`); wrap in try/catch so an unknown value keeps the default and never aborts the build.
- **Compose in auto-layout;** `i.layoutSizingHorizontal='FILL'` for inputs/rows that should stretch.
- **Robust:** try/catch each instantiation, collect a `built`/`errs` report — one missing component never kills the screen.
- **Verify:** export-png → Read → critique (the C5 gate). Set real text/tone per instance for a finished screen
  (default variant + text is fine for a scaffold).

Grounds on BOTH onboarding halves: the registry (C0 vocabulary) for *what* to instantiate, `CONVENTIONS.md`
(C7 grammar) for *how* to compose it on-brand. Audit the result with `/ui:audit` (C1) before landing.

---

## 19. User flow / journey layout (C3)

Lay N screens on a flow grid — named artboards, captions, connectors — so a journey reads at a glance. Proven live.
- Container = HORIZONTAL (or wrapped) auto-layout; each column = VERTICAL `[caption + screen frame]`.
- Connectors: a `→` text glyph (or a line node) between columns; keep gaps consistent.
- Screens: fixed-size frames (header bar + body); for REAL screens reference/clone the source at grid coords
  `ref_y + Δ` — never move the originals (resolve-by-NAME, `canvas-operations.md` R2 + clone-safety R5).
- Caption per screen ("1 · List", "2 · Detail", …); optional thumbnail export.
- Verify: export-png → Read the whole flow. Pairs with C6 (build each screen from real DS instances, Recipe 18)
  and captured from-url flows (Track 5).

## 20. Registry reconcile — keep the onboarded DS honest (C4)

As the live file is edited, diff the onboarded `component-registry.json` (C0) against a fresh scan **by NAME**
(ids drift — R2). Proven: in-sync when unchanged; a rename/removal is caught.
- Fresh scan: `figma-agent scan-design-system` → classify (C0.1) → the current component NAME set.
- Diff (deterministic, zero-token): `missing_in_live` (in registry, gone from file) + `extra_in_live` (new in
  file). A rename shows as one missing (old name) + one extra (new name).
- Report drift; re-`ingest-figma-ds` to refresh, or register the new/renamed components.
- Skip generic-named junk (`Frame`, `Component 1`) — the same stoplist the audit uses (C1.1).

---

## Recipe → lint map (maps to figma-craft.md's construction lints)

| Recipe | Guards against |
|---|---|
| 1, 2, 3 | L2 truncation-risk · L3 fixed-text-cells · `structure-hygiene.md` §3 (flipped icon/label order) |
| 4, 5 | L1 absolute-soup · L4 off-grid-spacing · L11 radius-scale (concentric rule) |
| 9 | L3 *exception* — fixed columns are correct here |
| 10, 14 | L8 stray-absolutes · hierarchy separation |
| 12 | mixed-size numerals misaligned (see Recipe 12's BASELINE note) |
| all | L6 unbound-fills — bind variables when the file has tokens |

Provenance: FrameNode/TextNode/Paint/Effect pages at developers.figma.com (values verified
2026-07-02) · canvas-proven live smoke + screen-rebuild session · token/tier values from the
source project's component vocabulary.
