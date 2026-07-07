# Components, Variables & Styles — construction-time systems craft

How to build Figma files that behave like a design SYSTEM, not a picture of one.
Every rule: (a) principle, (b) when it applies, (c) exact Plugin API / CLI realization,
(d) provenance. All snippets are `figma-agent exec-js` ready (async body, `figma` global,
`return` = reply). Manifest is `documentAccess: "dynamic-page"` → **always the `*Async`
getters/setters**; load ALL fonts before any text edit (see `figma-agent-hand.md`).

Companion: `structure-hygiene.md` (naming, pages, lints). This file is the CONSTRUCTION
side of the checks `figma-craft.md`'s construction lints validate (L6 unbound-fills,
L7 lookalike-frames, L11 radius-scale) — build so the lints pass, don't fix after.

---

## 1. Components

### 1.1 When to componentize

- **Principle:** a repeated visual pattern with a stable role gets ONE source of truth.
  Copies drift; components propagate.
- **When:** the same subtree appears **≥2 times** AND you can name its variation axes
  (state, size, tone…). One-off hero art: don't. Buttons/badges/cards/rows/inputs: always.
  Converter output never emits instances ("Component instances 0/10" in a canvas-proven
  audit) — so after `html-to-figma`, component extraction is YOUR job, round 1.
- **Also componentize at 1 occurrence** when the element is a known DS primitive (button,
  chip, avatar): the second use is coming.
- **Don't componentize** layout scaffolding (page shells, one-off section wrappers) —
  wrapper frames are structure, not vocabulary.

### 1.2 Creating components

```js
// Brand new (empty) component:
const c = figma.createComponent();               // ComponentNode, 100x100 default
// From an existing, already-styled frame (the normal path after a build):
const frame = await figma.getNodeByIdAsync('12:34');
const comp = figma.createComponentFromNode(frame); // keeps children, size, position
comp.name = 'Button/Primary';
```

- `createComponentFromNode(node)` is the workhorse: build the frame with auto-layout
  first, promote it after it's right. The node is consumed (becomes the component).
- Position components on a dedicated `[components]` section/page, not scattered in the
  artboard (see `structure-hygiene.md` §2).
- Provenance: https://developers.figma.com/docs/plugins/api/figma/ (`createComponent`,
  `createComponentFromNode`).

### 1.3 Variants — combineAsVariants + naming contract

- **Principle:** variation axes live in ONE component set, not sibling components named
  "Button 2 hover final".
- **When:** ≥2 components differ only along enumerable axes (State, Size, Tone…).
- **How:**

```js
// Signature: combineAsVariants(nodes: ReadonlyArray<ComponentNode>,
//            parent: BaseNode & ChildrenMixin, index?: number): ComponentSetNode
const set = figma.combineAsVariants([compDefault, compHover, compDisabled], figma.currentPage);
set.name = 'Button/Primary';
// Variant NAMING CONTRACT: each child component's name = comma-separated
// "Property=Value" pairs. This IS the data model — the set parses names into properties.
compDefault.name  = 'State=Default';
compHover.name    = 'State=Hover';
compDisabled.name = 'State=Disabled';
// Multi-axis: 'State=Default, Size=Large'
```

- There is no `createComponentSet()` — empty sets are illegal; you always combine
  existing components.
- Renaming a variant child to a non-`Prop=Value` shape silently creates a property
  named after the whole string — lint for `=` in every child name of a `COMPONENT_SET`.
- Provenance: https://developers.figma.com/docs/plugins/api/figma/#combineasvariants ·
  naming convention: https://help.figma.com/hc/en-us/articles/360056440594 (Create and
  use variants).

### 1.4 Component properties — definitions

`componentPropertyDefinitions` (readonly map) + three mutators. Types:
`'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP'` (+ newer `'SLOT'`, ignore until needed).

```js
const set = await figma.getNodeByIdAsync('<COMPONENT_SET_ID>');
// Add — returns the ACTUAL property name (BOOLEAN/TEXT/INSTANCE_SWAP get a '#id' suffix):
const showIconProp = set.addComponentProperty('showIcon', 'BOOLEAN', true);
const labelProp    = set.addComponentProperty('label', 'TEXT', 'Button');
const iconProp     = set.addComponentProperty('icon', 'INSTANCE_SWAP', iconComponent.id,
  { preferredValues: [{ type: 'COMPONENT', key: iconComponent.key }] });
// Edit (rename / change default):
set.editComponentProperty(labelProp, { defaultValue: 'Submit' });
// Inspect:
return set.componentPropertyDefinitions; // { 'State': {type:'VARIANT', variantOptions:[…]}, 'label#12:3': {…} }
```

Rules that bite:
- **VARIANT properties are only creatable on `ComponentSetNode`** (they come from child
  names, §1.3); `addComponentProperty('X','VARIANT',…)` on a plain `ComponentNode` throws.
  BOOLEAN/TEXT/INSTANCE_SWAP work on both `ComponentNode` and `ComponentSetNode`.
- **Keep the returned name** (with `#suffix`) — you need it verbatim for
  `componentPropertyReferences` and `setProperties`. Never hand-type the suffix.
- `deleteComponentProperty(name)` works for BOOLEAN/TEXT/INSTANCE_SWAP; VARIANT props are
  removed by renaming/removing variant children.
- Provenance: https://developers.figma.com/docs/plugins/api/ComponentSetNode/
  (`addComponentProperty`, `editComponentProperty`, `componentPropertyDefinitions`).

**Wiring properties to layers** — a definition does nothing until a layer references it:

```js
const label = set.defaultVariant.findOne(n => n.type === 'TEXT');
label.componentPropertyReferences = { characters: labelProp };   // TEXT prop → text layer
const icon = set.defaultVariant.findOne(n => n.name === 'icon'); // an InstanceNode
icon.componentPropertyReferences = { mainComponent: iconProp,    // INSTANCE_SWAP → instance
                                     visible: showIconProp };    // BOOLEAN → visibility
```

Wire the SAME references in every variant child (walk all children of the set), or the
property silently stops working on the unwired variants.
Provenance: https://developers.figma.com/docs/plugins/api/node-properties/ →
`componentPropertyReferences`.

### 1.5 Nested components + exposed instances

- **Principle:** compose big components from small ones (Card contains Button instance);
  expose the nested instance so consumers can flip its variant without drilling.
- **When:** the nested part has its own useful properties (button state inside a card).
- **How:**

```js
// Inside the MAIN component: mark the nested instance as exposed
const nested = mainComponent.findOne(n => n.type === 'INSTANCE' && n.name === 'Button');
nested.isExposedInstance = true;    // writable only on instances INSIDE a component
// Consumers then see it under instance.exposedInstances:
const card = component.createInstance();
card.exposedInstances[0].setProperties({ State: 'Hover' });
```

- Provenance: https://developers.figma.com/docs/plugins/api/InstanceNode/
  (`isExposedInstance`, `exposedInstances`).

---

## 2. Instances

### 2.1 Creating

```js
// Local component (same file — the ONLY path on Figma Free, see §3.7):
const inst = component.createInstance();       // parent it, then let auto-layout place it
parentFrame.appendChild(inst);
// Published library component (paid-plan team libraries only):
const comp = await figma.importComponentByKeyAsync('<key>'); // key from scan / library
const inst2 = comp.createInstance();
```

- `importComponentByKeyAsync` **only resolves published components** — the `key` exists
  on local components too, but import fails until published (typings note on
  `ComponentNode.key`). On Free files: use `figma-agent scan-design-system --out ds.json`
  to inventory local components, then instantiate by node id.
- CLI shortcut: `figma-agent create-instance --component <key|id> --parent <id>`.
- Provenance: https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync ·
  https://developers.figma.com/docs/plugins/api/ComponentNode/#createinstance

### 2.2 setProperties

```js
inst.setProperties({
  'State': 'Hover',            // VARIANT: plain name, value must be an existing option
  'label#12:3': 'Save',        // TEXT: MUST use the '#suffix' name from definitions
  'showIcon#12:4': false,      // BOOLEAN
  'icon#12:5': otherComp.id,   // INSTANCE_SWAP: component id
});
// Read back: inst.componentProperties  (readonly)
```

Get exact property names first: `(await inst.getMainComponentAsync()).parent
.componentPropertyDefinitions` (set) or `mainComponent.componentPropertyDefinitions`.
CLI: `figma-agent set-variant --node <id> --props State=Hover`.
Provenance: https://developers.figma.com/docs/plugins/api/InstanceNode/#setproperties

### 2.3 The overrides model — what survives a swap

- Overrides = per-instance deltas (text, fills, visibility…) recorded against layers of
  the main component. `inst.overrides` lists `{id, overriddenFields}`; `removeOverrides()`
  resets (the old `resetOverrides()` is deprecated).
- `inst.swapComponent(otherComponent)` **preserves overrides "using the same heuristics
  as instance swap in the Figma UI" — matching is by layer NAME (and structure)**. An
  override on a layer named `label` survives a swap only if the target component also
  has a layer named `label`. This is the systems reason for disciplined layer naming
  (`structure-hygiene.md` §1): sloppy names silently drop user customizations on swap.
- Under dynamic-page, `inst.mainComponent` is write-only — READ via
  `await inst.getMainComponentAsync()`.
- Provenance: https://developers.figma.com/docs/plugins/api/InstanceNode/
  (`swapComponent`, `overrides`, `getMainComponentAsync`).

### 2.4 Detach = last resort

```js
const frame = inst.detachInstance(); // returns FrameNode; the link is GONE
```

- Detaching severs propagation forever and **also detaches ancestor instances** in nested
  setups — one careless detach deep in a card can detach the card. Only detach when the
  design has genuinely diverged from the component's role AND no variant/property can
  express it. Prefer: add a variant, add a BOOLEAN/TEXT prop, or expose a nested instance.
- Detached frames are a lint target: `frame.detachedInfo !== null`
  (see `structure-hygiene.md` §5, lint L4).
- Provenance: https://developers.figma.com/docs/plugins/api/InstanceNode/#detachinstance

---

## 3. Variables

### 3.1 Collections & modes

```js
const collection = figma.variables.createVariableCollection('tokens');
const darkModeId = collection.addMode('dark');       // returns modeId; throws at plan cap:
                                                     // "in addMode: Limited to N modes only"
collection.renameMode(collection.modes[0].modeId, 'light');
const all = await figma.variables.getLocalVariableCollectionsAsync();
```

- Mode limits are PLAN-gated: Starter = 1 mode; Professional = 10; Organization = 20
  (raised at Schema 2025); Enterprise = 40. Up to 5,000 variables per collection on any
  plan. A canvas-proven smoke probe (2026-07-02) saw 9 modes OK in a file likely sitting
  in a paid org — on a personal Free draft assume **1 mode**; design token architecture
  accordingly (theme = separate semantic collections if stuck on Free, modes when the
  plan allows).
- Provenance: https://help.figma.com/hc/en-us/articles/35794667554839 (Schema 2025 mode
  limits) · https://help.figma.com/hc/en-us/articles/15145852043927 (5,000/collection) ·
  plan matrix: https://help.figma.com/hc/en-us/articles/360040328273

### 3.2 Types & creation

```js
// createVariable(name, collection: VariableCollection, resolvedType) — collection OBJECT,
// the old collectionId-string overload is deprecated.
const v = figma.variables.createVariable('color/bg/surface', collection, 'COLOR');
v.setValueForMode(collection.modes[0].modeId, { r: 1, g: 1, b: 1, a: 1 });
```

Types: `'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN'`. FLOAT carries every numeric token
(spacing, radius, size, opacity); STRING carries font family/style names and content.
Provenance: https://developers.figma.com/docs/plugins/api/figma-variables/

### 3.3 Tier architecture — primitive → semantic → component

- **Principle:** raw values live ONCE in primitives; meaning is added by aliasing, not by
  re-entering hex codes. Nodes bind to the semantic (or component) tier — never to
  primitives directly.
- **When:** any file that will outlive one screen. For a one-shot mock, a single semantic
  tier is acceptable; never zero tiers (naked hex everywhere is a hard-cap taste-gate
  failure).
- **How:**

```js
// tier 1: primitive            color/blue/600 = #4F46E5
// tier 2: semantic (alias)     color/bg/action → color/blue/600
// tier 3: component (alias)    button/bg       → color/bg/action
const semantic = figma.variables.createVariable('color/bg/action', collection, 'COLOR');
semantic.setValueForMode(modeId, figma.variables.createVariableAlias(primitiveVar));
// resolve what a consumer node will actually get:
return semantic.resolveForConsumer(someNode); // {value, resolvedType}
```

- Slash names (`color/bg/action`) render as a folder tree in the Figma variables UI —
  the naming IS the taxonomy.
- Provenance: https://developers.figma.com/docs/plugins/api/figma-variables/#createvariablealias ·
  guide: https://developers.figma.com/docs/plugins/working-with-variables/

### 3.4 Binding — the field map

Two distinct mechanisms; using the wrong one is the #1 binding bug.

**A. Direct node fields → `node.setBoundVariable(field, variable)`** (pass the Variable
OBJECT; the string-id overload is deprecated and throws under dynamic-page):

| Field group | Exact field names (verified against plugin-typings `VariableBindableNodeField`) |
|---|---|
| Size | `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` |
| Auto-layout | `itemSpacing`, `counterAxisSpacing`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` |
| Shape | `cornerRadius`, `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`, `strokeWeight` (+ per-side) |
| Misc | `opacity`, `visible`, `characters` |
| Text (FLOAT/STRING vars) | `fontFamily`, `fontStyle`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `paragraphIndent` |

```js
node.setBoundVariable('cornerRadius', radiusVar);
node.setBoundVariable('itemSpacing', gapVar);
```

**B. Paints (fills/strokes) → immutable-copy pattern via `setBoundVariableForPaint`.**
Paint arrays are readonly; you must clone, rebind the paint, reassign:

```js
const paints = [...node.fills];   // clone — fills is readonly
paints[0] = figma.variables.setBoundVariableForPaint(paints[0], 'color', colorVar);
node.fills = paints;              // reassign triggers the update
```

This exact pattern is what the figma-agent CLI's `bind-variable` command implements
under the hood — it even creates a black solid first if the node has no paint to bind
onto. Effects analog: `setBoundVariableForEffect(effect, field, v)` with fields
`color | radius | spread | offsetX | offsetY`.

**CLI:** `figma-agent bind-variable --node <id> --field fills|strokes|cornerRadius|itemSpacing|padding*|width|height|opacity --variable <id|name>`.

**Read side (lints):** `node.boundVariables` — `{ fills: VariableAlias[], cornerRadius:
VariableAlias, … }` — this is what `figma-craft.md`'s L6 unbound-fills lint walks.
Provenance: https://developers.figma.com/docs/plugins/working-with-variables/ ·
typings `VariableBindableNodeField`/`VariableBindablePaintField`
(https://github.com/figma/plugin-typings/blob/master/plugin-api.d.ts).

### 3.5 Scopes — steer the UI pickers

```js
radiusVar.scopes = ['CORNER_RADIUS'];
gapVar.scopes    = ['GAP'];
bgVar.scopes     = ['FRAME_FILL', 'SHAPE_FILL'];
textColorVar.scopes = ['TEXT_FILL'];
```

Full enum (verified in plugin-typings): `ALL_SCOPES`, `TEXT_CONTENT`, `CORNER_RADIUS`,
`WIDTH_HEIGHT`, `GAP`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`,
`STROKE_COLOR`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `EFFECT_COLOR`, `OPACITY`,
`FONT_FAMILY`, `FONT_STYLE`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`,
`LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`.

Two facts that matter:
- **Scopes filter the Figma UI pickers only — the API ignores them.** `setBoundVariable`
  will happily bind a `CORNER_RADIUS`-scoped var to `itemSpacing`. Discipline is on you;
  set scopes anyway so human collaborators get clean pickers.
- Default is `['ALL_SCOPES']` — a file where every color offers itself for every fill is
  a hygiene smell. Scope semantic-tier variables tightly; primitives may stay broad.
Provenance: https://developers.figma.com/docs/plugins/api/Variable/ (`scopes`).

### 3.6 NO getVariableByName → resolve-or-create (the load-bearing pattern)

**The API has no name lookup** — only `getVariableByIdAsync` and
`getLocalVariablesAsync(type?)` (verified: https://developers.figma.com/docs/plugins/api/figma-variables/).
Naive "create on every run" floods the file with duplicate tokens. The proven fix is a
resolve-or-create routine:

1. `findOrCreateCollection(name)` — list collections, match by name, else create.
2. `findReusableVariable(collection, type, value)` — `getLocalVariablesAsync(type)`,
   filter to the collection, compare default-mode value (**colors with epsilon 1/512**
   for hex→RGBA round-trip tolerance; skip alias values), reuse on match.
3. Else `createVariable` + `setValueForMode`.

Exposed as `figma-agent create-variable …` → returns `{id, name, reused}` — live-verified
`reused:true` on second run (canvas-proven smoke test, 2026-07-02). In raw exec-js,
replicate the same lookup before ANY `createVariable`; matching by NAME instead of value
is also valid when your token registry owns naming (name = identity, then update the
value). Never create blind.

### 3.7 Publish limits on Free

**Starter (Free) cannot publish libraries at all** — no styles, components, or variables
across files ("Libraries are only available on paid plans",
https://help.figma.com/hc/en-us/articles/360025508373). Consequences for this stack
(which targets Figma Free — see `figma-agent-hand.md`):
- Everything is LOCAL: build components + variables in the working file itself.
- `importComponentByKeyAsync` / `importVariableByKeyAsync` / `importStyleByKeyAsync`
  will fail — inventory local assets with `scan-design-system` instead.
- The plugin can never publish even on paid plans (no publish API) — the user does it.
- Wrap variable creation in try/catch so plan caps degrade to warnings, not aborted
  imports.

---

## 4. Styles vs Variables — decision table

Variables superseded color/number styles for TOKENS; styles remain the only carrier for
COMPOSITES. (Styles can themselves consume variables — best of both.)

| Need | Use | API |
|---|---|---|
| Single color token (bg, text, border) | **Variable** (COLOR) | §3.2 + bind §3.4B |
| Spacing / radius / size / opacity token | **Variable** (FLOAT) | §3.4A |
| Full text ramp entry (family+size+weight+lineHeight as ONE named thing) | **Text style** — still style-only; no "text variable" composite exists | `figma.createTextStyle()`, apply `await textNode.setTextStyleIdAsync(style.id)` (dynamic-page: the async setter, `textStyleId` is read-only) |
| Individual type primitives feeding the ramp | Variables (`fontSize`, `fontFamily`… §3.4A) bound INTO the text style via `setBoundVariable` on the style, or per-node | typings `VariableBindableTextField` |
| Shadow / blur recipe (multi-effect) | **Effect style** | `figma.createEffectStyle()`, `await node.setEffectStyleIdAsync(id)`; bind its color/radius to variables via `setBoundVariableForEffect` |
| Multi-stop gradient / image fill | **Paint style** (variables only bind solid-paint color + gradient stop colors) | `figma.createPaintStyle()`, `await node.setFillStyleIdAsync(id)` |
| Theming (light/dark, brand A/B) | Variables + modes (plan-gated §3.1) | `setValueForMode` per mode |
| Layout grids | Grid style or per-node `layoutGrids` (+ `setBoundVariableForLayoutGrid`) | `setGridStyleIdAsync` |

Rules of thumb:
- If a value should FLIP with a mode → variable. If it's a bundle of properties applied
  as one → style. If both: style whose internals are variable-bound.
- Local styles: `getLocalTextStylesAsync()` / `getLocalPaintStylesAsync()` etc. — sync
  variants throw under dynamic-page (typings). Reuse-before-create applies to styles
  exactly like §3.6 (match by name).
- Provenance: https://developers.figma.com/docs/plugins/api/figma/ (create*Style) ·
  typings `setTextStyleIdAsync`/`setFillStyleIdAsync`/`setEffectStyleIdAsync`.

---

## 5. Construction checklist (before handing to critique)

1. Repeated subtree ≥2 → component + variants named `Prop=Value` (§1.1–1.3).
2. Every fill/stroke on a token-colored element bound (`boundVariables.fills` set) —
   `figma-craft.md`'s L6 unbound-fills lint walks this; bind at build time (§3.4B).
3. Radius/gap/padding bound to FLOAT vars where a token exists (§3.4A).
4. Variables created ONLY via resolve-or-create (§3.6) — second run must report reuse.
5. Semantic tier aliases primitives (§3.3); nodes never bind primitives directly.
6. Scopes set on every semantic variable (§3.5).
7. Text uses text styles (or bound text fields), fonts that exist in Figma (Google fonts
   are pixel-true; unmatched fonts drift → truncation — live lesson 2026-07-02).
8. Zero detached instances (`detachedInfo === null` everywhere) (§2.4).
