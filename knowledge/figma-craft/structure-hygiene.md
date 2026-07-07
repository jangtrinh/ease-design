# Structure & Hygiene — naming, pages, layer order, file lints

A senior designer's file reads like clean code: names carry meaning, pages have roles,
z-order is intentional, nothing dead lingers. This file covers CONSTRUCTION-time rules +
detection lints. Every lint is an `exec-js` snippet (async body, `figma` global,
dynamic-page → `*Async` APIs). Assumes the shared walker pattern used throughout this
knowledge base:

```js
const root = await figma.getNodeByIdAsync('<NODE_ID>');
const hits = [];
const walk = (n) => { check(n); if ('children' in n) n.children.forEach(walk); };
// define check(n), then: walk(root); return hits.slice(0, 50);
```

**Scope:** `figma-craft.md`'s own construction lints (L1–L14) already cover unbound
fills (L6), radius scale (L11), off-grid spacing (L4), lookalike frames (L7), and
stretch/gap auditing (L5) at construction time. This file adds the naming/page/hygiene
rules those lints assume, plus lints figma-craft.md's L1–L14 do NOT cover (default
names, hidden layers, orphans, detached instances, pointless wrappers, mixed-page
pollution). Cross-references to figma-craft.md's lints are marked `→ figma-craft.md`.

---

## 1. Naming conventions

- **Principle:** `Frame 47` is a compile warning. Names are the API of the file: swap
  heuristics match overrides BY LAYER NAME (`components-variables-styles.md` §2.3),
  slash names build the asset-panel taxonomy, and every lint/critique script greps names.
- **When:** name at creation time, every node you create. Renames after the fact break
  override matching on existing instances — another reason to get it right in the build.
- **The scheme:**
  - **Components / component sets:** PascalCase + slash taxonomy — `Button/Primary`,
    `Card/Product`, `Icon/Arrow/Left`. Slashes group components into folders in the
    assets panel and instance-swap menus
    (https://help.figma.com/hc/en-us/articles/360038663994 — Name and organize components).
  - **Variant children inside a set:** ONLY `Prop=Value, Prop2=Value2` — the name is the
    data model (`components-variables-styles.md` §1.3).
  - **Layers (frames/text/vectors):** short semantic role, kebab-case or Title Case —
    `header`, `nav-items`, `price`, `label`, `icon`. Consistent WITHIN a component family
    (swap matching is exact).
  - **Variables:** slash taxonomy, lowercase — `color/bg/action`, `space/md`, `radius/pill`.
  - **Pages:** role prefix — see §2.
- **How (exec-js):** `node.name = 'nav-items'` at creation; batch-rename by role:

```js
// name text layers by role heuristics after an html-to-figma import
const check = (n) => {
  if (n.type === 'TEXT' && /^Text ?\d*$/i.test(n.name))
    n.name = n.characters.slice(0, 20).trim().toLowerCase().replace(/\s+/g, '-') || 'text';
};
```

- Provenance: help article above; swap-heuristics rationale:
  https://developers.figma.com/docs/plugins/api/InstanceNode/#swapcomponent

## 2. Page organization

- **Principle:** pages are chapters — cover, ready work, WIP, components, graveyard.
  A stranger must know what's shippable without asking.
- **When:** any file beyond one screen; ALWAYS when the agent experiments (never dirty
  the user's working pages — proven recipe #6, `figma-agent-hand.md`).
- **Canonical page set:**
  `Cover` · `Screens` (or per-flow pages) · `Components` · `[wip] <topic>` ·
  `[draft] explorations` · `[archive]`. Bracket prefixes = not-ready, cheap to grep.
  Agent experiments: `[FA <topic>]` (established convention from a live smoke test).
- **How:**

```js
const page = figma.createPage();
page.name = '[FA experiment-badges]';
await figma.setCurrentPageAsync(page);          // dynamic-page: async, not assignment
```

  Cover thumbnail: build a `Cover` frame, then
  `await figma.setFileThumbnailNodeAsync(coverFrame)` (accepts frame/component/section).
- **Sections within a page** — group related frames spatially with a titled container:

```js
const s = figma.createSection();                // SectionNode
s.name = 'Checkout flow';
s.resizeWithoutConstraints(3200, 1400);
s.appendChild(existingFrame);                   // reparent screens into it
```

  Sections don't clip or lay out children — pure spatial/semantic grouping; also carry
  `devStatus` (ready-for-dev marking).
- Provenance: https://developers.figma.com/docs/plugins/api/SectionNode/ ·
  https://developers.figma.com/docs/plugins/api/figma/#createsection

## 3. Layer order semantics

- **Principle:** child index is MEANING. `children[0]` renders bottom-most (painted
  first); `appendChild` puts on top. In auto-layout, child order = flow order — a flipped
  index is a flipped icon/label pair (a known converter defect — verify visually after
  any html-to-figma import).
- **When:** any insert/reparent; any overlay work.
- **Rules:**
  - Flow content: order children in reading order; fix with
    `parent.insertChild(correctIndex, node)`.
  - Overlays (badges, scrims, tooltips) inside auto-layout: `layoutPositioning =
    'ABSOLUTE'` + constraints — never fake overlap by index games in a NONE-layout frame
    (see `layout-mastery.md` §8 / `intent-recipes.md` Recipe 14 for the full fix
    snippet).
  - Auto-layout stacking of OVERLAPPING flow children (avatars pile):
    `frame.itemReverseZIndex = true` makes first-child render on top — deliberate uses
    only, name the frame accordingly (`avatar-stack`).
- Provenance: https://developers.figma.com/docs/plugins/api/node-properties/ (`children`,
  `insertChild`) · typings `AutoLayoutMixin.itemReverseZIndex`.

## 4. When wrapper frames earn their place

- **Principle:** every frame must contribute layout (auto-layout axis, padding, gap),
  paint (fill/stroke/effect), clipping, or semantics (a named region). A frame that does
  none is div-soup — it bloats depth, slows walks, and hides the real structure.
- **Earns its place:** row/column containers with gap; padded surfaces (cards); clip
  containers; `ABSOLUTE`-positioning contexts for overlay children; named slots inside
  components (swap-matching anchor).
- **Does NOT:** single-child frame with no layout/paint/clip and default name (import
  residue); groups used where a frame was meant (`GROUP` has no auto-layout, no padding —
  prefer FRAME; groups are for ad-hoc multi-select transforms only).
- **Fix:** promote the child (`wrapper.parent.insertChild(index, child)`) then
  `wrapper.remove()`; or give the wrapper its job (set layout + name).
- Detection: lint L5 below.

---

## 5. File hygiene lints

Run after every build round, before critique. Each: 3–10 line `check(n)` for the shared
walker. Return `hits.slice(0, 50)`.

### L1 — Default names (`Frame 47` syndrome)

```js
const DEFAULT = /^(Frame|Group|Rectangle|Ellipse|Line|Polygon|Star|Vector|Text|Component|Section|Union|Subtract|Intersect|Exclude) \d+$/;
const check = (n) => {
  if (DEFAULT.test(n.name)) hits.push({ id: n.id, type: n.type, name: n.name });
};
```

Zero tolerance on components and direct children of screens; import residue deeper down:
rename by role (§1). Also flag variant children whose name lacks `=` (broken naming
contract): `if (n.parent?.type === 'COMPONENT_SET' && !n.name.includes('=')) hits.push(…)`.

### L2 — Hidden layers (dead code)

```js
const check = (n) => {
  if (n.visible === false) hits.push({ id: n.id, name: n.name, type: n.type });
};
```

Legit ONLY when driven by a BOOLEAN component property (check
`n.componentPropertyReferences?.visible` before flagging). Everything else: delete or
move to `[archive]` — hidden layers ship in exports, confuse walks, and hide in handoff.

### L3 — Orphan / empty / stray nodes

```js
const check = (n) => {
  if ((n.type === 'FRAME' || n.type === 'GROUP') && n.children.length === 0)
    hits.push({ id: n.id, name: n.name, why: 'empty container' });
  if (n.parent?.type === 'PAGE' && n.width < 24 && n.height < 24)
    hits.push({ id: n.id, name: n.name, why: 'stray page-level fragment' });
};
```

Empty frames = deleted-content residue; tiny page-level strays = paste debris off-screen.
Delete both (`n.remove()`).

### L4 — Detached instances

```js
const check = (n) => {
  if (n.type === 'FRAME' && n.detachedInfo)   // null unless detached from a component
    hits.push({ id: n.id, name: n.name, from: n.detachedInfo });
};
```

Detach is last-resort (`components-variables-styles.md` §2.4). Fix: recreate as instance
+ overrides/props, or accept ONCE with a rename documenting why (`card--custom-legal`).
Provenance: typings `FrameNode.detachedInfo`.

### L5 — Pointless wrapper frames (§4)

```js
const check = (n) => {
  if (n.type !== 'FRAME' || n.children.length !== 1) return;
  const noLayout = n.layoutMode === 'NONE';
  const noPaint = (!Array.isArray(n.fills) || !n.fills.some(f => f.visible !== false))
    && n.strokes.length === 0 && n.effects.length === 0;
  if (noLayout && noPaint && !n.clipsContent)
    hits.push({ id: n.id, name: n.name, child: n.children[0].name });
};
```

### L6 — Hardcoded values where a token exists

→ `figma-craft.md`'s L6 unbound-fills lint covers FILLS (hard cap). Construction-time
additions here — strokes, radius, gap/padding against existing FLOAT variables:

```js
const floats = await figma.variables.getLocalVariablesAsync('FLOAT');
const modeIds = {}; // variable → default-mode value
for (const v of floats) modeIds[v.id] = Object.values(v.valuesByMode)[0];
const tokenVals = new Set(Object.values(modeIds));
const check = (n) => {
  const bv = n.boundVariables || {};
  for (const f of ['cornerRadius', 'itemSpacing', 'paddingLeft', 'paddingTop']) {
    const val = n[f];
    if (typeof val === 'number' && val > 0 && tokenVals.has(val) && !bv[f])
      hits.push({ id: n.id, name: n.name, field: f, value: val });
  }
  if (Array.isArray(n.strokes) && n.strokes.some(s => s.type === 'SOLID') && !bv.strokes)
    hits.push({ id: n.id, name: n.name, field: 'strokes' });
};
```

A raw `8` where `space/sm = 8` exists is a miss, not a style choice — bind it
(`bind-variable` / `setBoundVariable`, field map in `components-variables-styles.md` §3.4).

### L7 — Non-4/8 spacing

→ `figma-craft.md`'s L4 off-grid-spacing lint has the full snippet
(itemSpacing/counterAxisSpacing/padding* `% 4`). Construction rule here: never AUTHOR
off-grid values — converter residue (17, 13, 23) gets snapped to nearest 4 at fix time,
EXCEPT optical nudges on icons (±1 ok, name the layer `icon--optical`).

### L8 — Lookalike components (frames named like DS vocabulary)

→ `figma-craft.md`'s L7 lookalike-frames lint counts INSTANCE vs lookalike frames.
Construction-time census here — should have been componentized
(`components-variables-styles.md` §1.1):

```js
const check = (n) => {
  if (n.type === 'FRAME' && /^(button|btn|badge|chip|card|input|avatar|tag)/i.test(n.name)
      && !n.detachedInfo)
    hits.push({ id: n.id, name: n.name });
};
// >=2 hits with the same name prefix → promote one to a component, swap rest to instances
```

### L9 — Mixed-page pollution (agent discipline)

```js
const pages = figma.root.children.map(p => ({ name: p.name }));
return pages.filter(p => !/^(\[|Cover|Screens|Components)/.test(p.name));
```

Every page must match the §2 taxonomy; agent output belongs on `[FA …]` pages until the
user promotes it.

---

## 6. Order of operations (hygiene pass)

1. Build → run L1–L9 in ONE combined walk (batch predicates; smoke-proven: single ops
   70–430ms; keep scripts scoped to the target frame).
2. Fix construction-side (rename, rebind, reparent, delete) via targeted `exec-js`.
3. Only then `export-png` → run ease-design's critique gate (`templates/workflows/critique.md`
   + `knowledge/taste-rubric.md`) for the vision + structural pass. Hygiene lints passing
   ≠ good design; they just stop the critique loop wasting rounds on residue.
