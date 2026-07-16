// Faithful-enough mock of the Figma plugin `figma` global for the spec-005 spike
// fixed-point harness. It runs the REAL forward builder (executor-frame.createFigmaNode)
// so the round-trip exercises production code, not a re-implementation.
//
// The mock reproduces the THREE Figma behaviours that actually drive the spike's
// findings (everything else is verbatim property storage):
//   1. layoutSizingHorizontal/Vertical THROW unless the node sits in an auto-layout
//      parent — this is why a ROOT frame's own sizing never round-trips.
//   2. cornerRadius GETTER returns figma.mixed when the four corners differ — the
//      walker must fall back to per-corner reads.
//   3. variable bindings are recorded on node.boundVariables (scalar fields) and on
//      the PAINT's boundVariables (fills/strokes) — the split the walker must scan.
//   4. an INSTANCE mirrors its main component (createInstance clones it) and
//      setProperties throws on a property the main does not expose — the two
//      behaviours the spec-005 P2 instance round-trip stands on.
//   5. the `documentAccess: "dynamic-page"` manifest reality, confirmed on the live
//      canvas: the SYNC `mainComponent` getter THROWS ("Use node.getMainComponentAsync
//      instead") — only the async twin resolves a main. A mock that answered the sync
//      getter is why the P2 round-trip passed offline and lost every component ref live.
//   6. `name` is a REQUIRED property: assigning undefined/'' throws, as Figma does.
//      The permissive mock let a nameless spec build here and crash the live rebuild.
//   7. a PUBLISHED (library) variable is invisible to getLocalVariablesAsync but
//      answers getVariableByIdAsync with remote=true + a publish key, and
//      importVariableByKeyAsync links THAT SAME variable back (throwing on an
//      unpublished key). This split is the whole of the spec-005 P7 gap.
//   9. setBoundVariable REFUSES 'maxWidth' on a TEXT node ("invalid field for text
//      node") while accepting it on a FRAME — proven live, and the reason the P5
//      footer text could never round-trip its UI-authored maxWidth binding.
//  10. TextNode.fontName returns figma.mixed on style-linked text even when every
//      character shares ONE font — the live footer 25575:354192 reports mixed while
//      getStyledTextSegments gives a single "Be Vietnam Pro"/Regular segment. Only
//      the segments tell the truth; setMixedFontNameGetter reproduces that state.
//   8. a LOCAL variable carries a publish key TOO (remote:false + key — what the
//      live probe found on the font fields), and importVariableByKeyAsync REFUSES
//      that key: nothing published it. So the only road home for a local key is the
//      local list, matched by key — the spec-005 P8 gap. A mock whose import
//      answered for any known key would hide exactly that.
//  11. an instance's inner nodes carry the COMPOUND id `I<instanceId>;<idInTheMain>`,
//      and `InstanceNode.overrides` reports every node whose field differs from its
//      main twin — INCLUDING the ones resize() rewrote as a side-effect. Hand-written
//      override arrays could never surface that, and it is the whole hazard of P11.
// It does NOT emulate Figma's layout re-flow (a child's FILL coercing the parent's
// sizing mode) — exactly the class of loss the LIVE half (P5) must confirm.

let idSeq = 0;
export const FIGMA_MIXED = Symbol('figma.mixed');

/** instance node → the MAIN node it mirrors, for the `overrides` bookkeeping below. */
const mainTwinOf = new WeakMap<FakeNode, FakeNode>();

/** An effect style, as a file holds one: an id the node links to + the effects it
 * carries. A DS shadow's effects are variable-BOUND (live P15: colour, radius,
 * spread, offsetX and offsetY, all five), which is the whole reason the link must be
 * replayed rather than the shadows copied. */
export interface FakeEffectStyle { id: string; name: string; effects: unknown[] }
let effectStyles: FakeEffectStyle[] = [];
export function setMockEffectStyles(styles: FakeEffectStyle[]): void { effectStyles = styles; }

/**
 * id → node, for every node an instance owns. `getNodeByIdAsync` MUST answer for a
 * compound inner id (`I<instanceId>;<mainChildId>`) because the live API does — probed
 * on the P5 gate, where `getNodeByIdAsync("I25575:353516;25575:353404")` resolved. The
 * old mock only knew the file's components, which would have made the P12 pre-pass
 * look correct while silently resolving nothing.
 */
const nodesById = new Map<string, FakeNode>();

/**
 * Inner instances the user SWAPPED (spec-005 P12).
 *
 * Live fact this encodes: a swapped inner child ALWAYS appears in `overrides`, even
 * when every field it carries equals its main twin's — Figma reports the fields the
 * swap moved, and on the P5 gate all four of them (name/width/height/sizing) happened
 * to equal the main's. So an entry must exist where a differs-only comparison would
 * produce none; otherwise the mock hides the exact bug P12 fixes.
 */
const swappedNodes = new WeakSet<FakeNode>();

/**
 * main component → ("<prop>=<value>" → the component that variant selects).
 * A variant is not a property of one component, it IS another component; without
 * this registry the mock would let setProperties change a variant while the inner
 * tree stayed put — the exact permissiveness that hid spec-005 P13.
 */
const variantMainsOf = new WeakMap<FakeNode, Map<string, FakeNode>>();

/** Register the bodies a VARIANT property selects, e.g. `{'State=Disabled': comp}`. */
export function setVariantMains(main: FakeNode, bodies: Record<string, FakeNode>): void {
  variantMainsOf.set(main, new Map(Object.entries(bodies)));
}

/**
 * The live main component behind an instance — read off the mock's own storage, NOT
 * the `mainComponent` getter, which throws here exactly as it does under
 * `documentAccess: "dynamic-page"`. (That refusal caught the first draft of this
 * helper: strict mocks bite their author too, which is the point of them.)
 */
const mainNodeOf = (inst: FakeNode): FakeNode | undefined => {
  const id = inst.mainRefId;
  return id ? nodesById.get(id) : undefined;
};

/**
 * The fields `overrides` compares an instance's nodes against their main twins.
 * A superset of what the P11 replay can write (name/width/height/layoutGrow/
 * textAutoResize/*AxisSizingMode) plus the classes it deliberately cannot
 * (characters, fontSize, fills) — so a test can tell "reapplied" from "still lost".
 */
const OVERRIDE_COMPARED_FIELDS = [
  'name', 'width', 'height', 'layoutGrow', 'textAutoResize',
  'primaryAxisSizingMode', 'counterAxisSizingMode',
  'characters', 'fontSize', 'fills', 'opacity', 'visible',
  // The VISUAL classes (spec-005 P15). Absent here, this mock could not see the four
  // field names the live P15 gate lost on every scan — it would have reported the
  // rebuild as a perfect twin, which is exactly what a permissive mock is for.
  'strokes', 'effects', 'effectStyleId',
  // A variant picked / boolean toggled / text typed INSIDE an inner slot. Figma
  // reports it as this ONE field name on the inner node, with the values readable
  // off the node itself — the commonest inner override on a real file (spec-005 P13),
  // and invisible to this mock until it was compared here.
  'componentProperties',
] as const;

/**
 * The id an inner node carries, PROBED live (spec-005 P13):
 * `<parentPath>;<idInTheMain>`, where the outermost segment is `I<instanceId>`.
 * The `I` marks the instance ROOT only — it is never re-added per level, so a node
 * three deep reads `I<inst>;<a>;<b>;<c>`, not `I<inst>;<c>` (what this mock used to
 * produce) and not `II<inst>;…`. The chain is the whole reason a childKey can name a
 * node underneath a NESTED instance at all.
 */
const innerPath = (parentPath: string, mainId: string): string => `${parentPath};${mainId}`;

/**
 * The segment a twin contributes to that chain: its id IN ITS OWN MAIN.
 *
 * A main component can itself contain an instance, and that inner instance's children
 * already carry a compound id of their own (`I<slot>;<child>`). Live, the chain does
 * NOT nest those — the gate's key reads `21174:14662;112:1269`, where `112:1269` is
 * the child's id in the Button main, not `I21174:14662;112:1269`. Every segment is a
 * node's id in its own main; the `I` belongs to the outermost instance alone.
 */
const twinSegment = (main: FakeNode, twin: FakeNode): string => {
  const prefix = `I${main.id};`;
  return twin.id.startsWith(prefix) ? twin.id.slice(prefix.length) : twin.id;
};

const readOrUndefined = (n: FakeNode, f: string): unknown => {
  try {
    const v = (n as unknown as Record<string, unknown>)[f];
    return typeof v === 'symbol' ? undefined : v;
  } catch { return undefined; }
};

type Corners = { tl: number; tr: number; br: number; bl: number };
type Sides = { top: number; right: number; bottom: number; left: number };

export class FakeNode {
  id = `S:${idSeq++}`;
  type: string;
  width = 0;
  height = 0;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  boundVariables: Record<string, unknown> = {};
  private _corners: Corners = { tl: 0, tr: 0, br: 0, bl: 0 };
  private _sides: Sides = { top: 1, right: 1, bottom: 1, left: 1 };
  private _lsh: string | undefined;
  private _lsv: string | undefined;
  private _name = 'Node';
  private _main: { id?: string; key?: string; name?: string } | null = null;
  [key: string]: unknown;

  constructor(type: string) {
    this.type = type;
  }

  // ── name: REQUIRED (Figma rejects undefined/'' with a set_name validation error) ──
  set name(v: string) {
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error('in set_name: Property "name" failed validation: Required value missing');
    }
    this._name = v;
  }
  get name(): string { return this._name; }

  // ── mainComponent: sync getter is UNUSABLE under documentAccess: dynamic-page ──
  set mainComponent(v: { id?: string; key?: string; name?: string } | null) { this._main = v; }
  get mainComponent(): never {
    throw new Error(
      'in get_mainComponent: Cannot call with documentAccess: dynamic-page. '
      + 'Use node.getMainComponentAsync instead.',
    );
  }

  /** The stored main id — the mock's own bookkeeping, never a Plugin-API surface. */
  get mainRefId(): string | undefined { return this._main?.id; }

  /** InstanceNode.getMainComponentAsync — the ONLY way to reach the main live. */
  async getMainComponentAsync(): Promise<{ id?: string; key?: string; name?: string } | null> {
    return this._main;
  }

  /** resize() FIXES both axes of an auto-layout frame — Figma's documented
   * behaviour, and the one the permissive mock skipped. createFrameNode resizes
   * AFTER applying auto-layout, so without this every AUTO frame round-tripped as
   * AUTO here and rebuilt FIXED on the live canvas (P5 diffs on 25575:353653). */
  resize(w: number, h: number): void {
    // A FILL axis is owned by the auto-layout PARENT: resize() is a silent no-op on
    // it — no throw, no change, no override registered. PROBED live (spec-005 P13) on
    // a FILL/FILL child asked for 900x700: it stayed 1108x836 and `overriddenFields`
    // gained neither width nor height. Modelling the write as if it landed is what
    // made the residual width/height mirror diff look like a bug in the executor.
    if (this._lsh !== 'FILL') this.width = w;
    if (this._lsv !== 'FILL') this.height = h;
    const m = this.layoutMode as string | undefined;
    if (m && m !== 'NONE') {
      this.primaryAxisSizingMode = 'FIXED';
      this.counterAxisSizingMode = 'FIXED';
    }
  }

  appendChild(child: FakeNode): void {
    child.parent = this;
    this.children.push(child);
  }

  // ── effectStyleId: the sync setter is UNUSABLE under documentAccess: dynamic-page ──
  //
  // Same refusal class as the `mainComponent` getter above, and modelled for the same
  // reason: a mock that accepted `node.effectStyleId = id` would green-light a write
  // that can only ever throw on the live canvas.
  private _effectStyleId = '';
  private _effects: unknown[] = [];

  set effectStyleId(_v: string) {
    throw new Error(
      'in set_effectStyleId: Cannot call with documentAccess: dynamic-page. '
      + 'Use node.setEffectStyleIdAsync instead.',
    );
  }
  get effectStyleId(): string { return this._effectStyleId; }

  /**
   * The ONLY way to link an effect style live.
   *
   * Two refusals, both real: an id no style answers to throws (the cross-file case —
   * a style id is same-file only), and linking a style REPLACES the node's effects
   * with the style's, bindings and all. `''` unlinks and LEAVES the effects behind as
   * literals — which is why an override that cleared a shadow (live: 25579:746648)
   * needs the effects write too, and why the writer does both.
   */
  async setEffectStyleIdAsync(id: string): Promise<void> {
    if (id === '') { this._effectStyleId = ''; return; }
    const style = effectStyles.find((s) => s.id === id);
    if (!style) throw new Error(`in setEffectStyleIdAsync: style not found: ${id}`);
    this._effects = JSON.parse(JSON.stringify(style.effects));
    this._effectStyleId = id;
  }

  /** Writing effects directly DETACHES the style — Figma's own behaviour, and the
   * trap under the writer's order: a literal effects write layered on top of a style
   * link would silently drop the link the rebuild had just replayed. */
  set effects(v: unknown[]) {
    this._effects = v;
    this._effectStyleId = '';
  }
  get effects(): unknown[] { return this._effects; }

  /** Figma REFUSES some fields outright, by node type — encode the refusal, not the
   * happy path: a permissive mock here is what let the P5 rebuild ship a bind that
   * could only ever throw on the live canvas. */
  setBoundVariable(field: string, variable: { id: string }): void {
    if (this.type === 'TEXT' && field === 'maxWidth') {
      throw new Error(`in setBoundVariable: invalid field for text node: '${field}'`);
    }
    this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
  }

  // ── fontName: the node-level getter is figma.mixed on style-linked text ──
  private _fontName: unknown;
  private _fontNameMixed = false;
  private _segments: Array<Record<string, unknown>> | undefined;

  set fontName(v: unknown) { this._fontName = v; }
  get fontName(): unknown {
    return this._fontNameMixed ? (FIGMA_MIXED as unknown) : this._fontName;
  }

  /** Reproduce the live state of 25575:354192: the node-level getter refuses
   * (figma.mixed) while EVERY character still shares the one font below. */
  setMixedFontNameGetter(font: FontName): void {
    this._fontNameMixed = true;
    this._fontName = font;
  }

  /** Per-range styling. Absent explicit segments, the node is one uniform run — the
   * shape a freshly built text node has. */
  getStyledTextSegments(_fields: string[]): Array<Record<string, unknown>> {
    if (this._segments) return this._segments;
    const characters = typeof this.characters === 'string' ? this.characters : '';
    return [{ start: 0, end: characters.length, characters, fontName: this._fontName }];
  }

  /** Genuinely mixed text: more than one run, so no single fontName is true. */
  setStyledTextSegments(segments: Array<Record<string, unknown>>): void {
    this._fontNameMixed = true;
    this._segments = segments;
  }

  /** Own data props (incl. the private corner/sizing fields) + children, deep-copied. */
  private cloneAs(type: string): FakeNode {
    const copy = new FakeNode(type);
    for (const [k, v] of Object.entries(this)) {
      if (k === 'id' || k === 'type' || k === 'parent' || k === 'children') continue;
      copy[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    for (const c of this.children) copy.appendChild(c.cloneAs(c.type));
    return copy;
  }

  /** ComponentNode.createInstance — an instance MIRRORS its main until overridden. */
  createInstance(): FakeNode {
    const inst = this.cloneAs('INSTANCE');
    delete inst.key; // only a main component is publishable
    inst.mainComponent = { id: this.id, key: this.key as string | undefined, name: this.name };
    // The COMPOUND inner id — `I<instanceId>;<idOfTheNodeInTheMAIN>` — and the
    // main twin each inner node is measured against. Both are what makes an inner
    // override addressable across two instances of one main (spec-005 P11).
    const pair = (i: FakeNode, m: FakeNode, path: string): void => {
      mainTwinOf.set(i, m);
      i.children.forEach((child, idx) => {
        const twin = m.children[idx];
        if (!twin) return;
        child.id = innerPath(path, twinSegment(m, twin));
        nodesById.set(child.id, child);
        pair(child, twin, child.id);
      });
    };
    pair(inst, this, `I${inst.id}`);
    nodesById.set(inst.id, inst);
    return inst;
  }

  /**
   * InstanceNode.swapComponent — repoint an instance at a different main.
   *
   * Models what the live canvas shows a swap actually does: the inner TREE becomes the
   * new main's, the main ref follows it, and the node's OWN fields (name, size, sizing)
   * are PRESERVED as overrides rather than taken from the target — which is why the P5
   * gate's swapped slot reads 928x836 while its target component is 1104x836.
   */
  swapComponent(target: FakeNode): void {
    if (this.type !== 'INSTANCE') throw new Error('in swapComponent: node is not an instance');
    // retwin:false — a swapped node's OWN fields stay measured against the twin it
    // had, which is why the P5 gate's swapped slot still reads its preserved size.
    this.adoptSubtreeOf(target, false);
    swappedNodes.add(this);
  }

  /**
   * Replace this instance's inner tree with `target`'s — what BOTH a swap and a
   * variant change do on the live canvas. Ids follow the probed chain rule, rooted at
   * this node's own path (`I<inst>` at the top, the node's compound id when nested),
   * which is what makes a deep childKey resolvable after the tree is rebuilt.
   */
  private adoptSubtreeOf(target: FakeNode, retwin: boolean): void {
    for (const c of this.children) c.parent = null;
    this.children = [];
    const path = this.id.startsWith('I') ? this.id : `I${this.id}`;
    const graft = (into: FakeNode, from: FakeNode, at: string): void => {
      for (const c of from.children) {
        const copy = c.cloneAs(c.type);
        into.appendChild(copy);
        copy.id = innerPath(at, twinSegment(from, c));
        nodesById.set(copy.id, copy);
        // The new body IS the twin now — comparing the grafted nodes against the old
        // main's would report every one of them as overridden, which Figma does not.
        mainTwinOf.set(copy, c);
        graft(copy, c, copy.id);
      }
    };
    graft(this, target, path);
    if (retwin) mainTwinOf.set(this, target);
    this.mainComponent = { id: target.id, key: target.key as string | undefined, name: target.name };
  }

  // ── InstanceNode.overrides: DERIVED, not bookkept by hand ──
  //
  // The old mock stored nothing here and made every test hand-write the array — a
  // permissive mock in the exact place spec-005 P11 lives, so it could only ever
  // confirm the test's own assumption. Figma reports an override where an instance
  // node's field DIFFERS from its main twin's, so the mock computes precisely that.
  // It buys two behaviours no hand-written array can:
  //   - resize()'s side-effects (sizing modes → FIXED, and on TEXT the coerced
  //     textAutoResize) show up as REAL overrides the source never had;
  //   - a field restored to the main's value stops being an override.
  // DEVIATION, on purpose: Figma tracks some fields as "was set" rather than
  // "differs"; for a value that genuinely differs the two agree, which is the whole
  // domain here. `overrides =` still assigns a fixed list, for tests probing field
  // classes this mock has no storage for.
  private _overridesManual: { id: string; overriddenFields: string[] }[] | undefined;
  set overrides(v: { id: string; overriddenFields: string[] }[]) { this._overridesManual = v; }
  get overrides(): { id: string; overriddenFields: string[] }[] {
    if (this._overridesManual) return this._overridesManual;
    const main = mainTwinOf.get(this);
    if (!main) return [];
    const out: { id: string; overriddenFields: string[] }[] = [];
    const visit = (i: FakeNode, m: FakeNode): void => {
      const fields = OVERRIDE_COMPARED_FIELDS.filter(
        (f) => JSON.stringify(readOrUndefined(i, f) ?? null) !== JSON.stringify(readOrUndefined(m, f) ?? null),
      );
      // A swap is an override Figma never names in `overriddenFields` — so the entry
      // must exist even when nothing differs (see swappedNodes).
      if (fields.length || swappedNodes.has(i)) out.push({ id: i.id, overriddenFields: [...fields] });
      // A swapped node's children belong to its NEW main — comparing them against the
      // old twin's would report every one of them as overridden, which Figma does not.
      if (swappedNodes.has(i)) return;
      // Prefer the twin the node was PAIRED with (a variant rebuild re-pairs to the
      // new body); fall back to position for the ordinary cloned tree.
      i.children.forEach((c, idx) => { const t = mainTwinOf.get(c) ?? m.children[idx]; if (t) visit(c, t); });
    };
    visit(this, main);
    return out;
  }

  /**
   * InstanceNode.setProperties — the STRICT contract, refusals included.
   *
   * Figma refuses more than an unknown key, and setProperties is ALL-OR-NOTHING: it
   * validates every entry before applying any, so one bad key costs the whole call.
   * A permissive version of this method is what let spec-005 ship three green suites
   * over live bugs, so the refusals are modelled first:
   *   - a property the main does not expose → throw;
   *   - a value of the wrong type for the definition → throw;
   *   - a VARIANT value the component set has no variant for → throw.
   *
   * And the behaviour the P13 bug actually turned on: changing a VARIANT property
   * selects a DIFFERENT component, so the inner tree is REBUILT — every id beneath
   * this node is new afterwards. `setVariantMains` registers those variant bodies.
   */
  setProperties(props: Record<string, string | boolean>): void {
    if (this.type !== 'INSTANCE') throw new Error('in setProperties: node is not an instance');
    const defs = this.componentPropertyDefinitions as
      Record<string, { type?: string; variantOptions?: string[] }> | undefined;
    const mainNode = mainNodeOf(this);
    const variants = mainNode ? variantMainsOf.get(mainNode) : undefined;
    // Validate EVERYTHING first — no partial application (the all-or-nothing contract).
    for (const [k, v] of Object.entries(props)) {
      const def = defs?.[k];
      if (defs && !def) throw new Error(`property "${k}" not found on the main component`);
      const wantBoolean = def?.type === 'BOOLEAN';
      if (wantBoolean && typeof v !== 'boolean') throw new Error(`property "${k}" expects a boolean`);
      if (def && !wantBoolean && typeof v !== 'string') throw new Error(`property "${k}" expects a string`);
      if (def?.type === 'VARIANT' && def.variantOptions && !def.variantOptions.includes(v as string)) {
        throw new Error(`property "${k}" has no variant "${String(v)}"`);
      }
    }
    const current = (this.componentProperties as Record<string, { type?: string; value: unknown }>) ?? {};
    const next: Record<string, { type: string; value: unknown }> = { ...(current as never) };
    let rebuildTo: FakeNode | undefined;
    for (const [k, v] of Object.entries(props)) {
      const type = defs?.[k]?.type ?? current[k]?.type ?? 'VARIANT';
      if (type === 'VARIANT' && current[k]?.value !== v) rebuildTo = variants?.get(`${k}=${String(v)}`);
      next[k] = { type, value: v };
    }
    this.componentProperties = next;
    // A variant IS a different component — take its body, ids and all.
    if (rebuildTo) this.adoptSubtreeOf(rebuildTo, true);
  }

  private get inAutoLayout(): boolean {
    const m = this.parent?.layoutMode as string | undefined;
    return !!m && m !== 'NONE';
  }

  // ── cornerRadius: uniform value, or figma.mixed when corners differ ──
  set cornerRadius(v: number) { this._corners = { tl: v, tr: v, br: v, bl: v }; }
  get cornerRadius(): number | symbol {
    const { tl, tr, br, bl } = this._corners;
    return tl === tr && tr === br && br === bl ? tl : (FIGMA_MIXED as unknown as symbol);
  }
  set topLeftRadius(v: number) { this._corners.tl = v; }
  get topLeftRadius(): number { return this._corners.tl; }
  set topRightRadius(v: number) { this._corners.tr = v; }
  get topRightRadius(): number { return this._corners.tr; }
  set bottomRightRadius(v: number) { this._corners.br = v; }
  get bottomRightRadius(): number { return this._corners.br; }
  set bottomLeftRadius(v: number) { this._corners.bl = v; }
  get bottomLeftRadius(): number { return this._corners.bl; }

  // ── layoutSizing: the NEWER view of the same state as primary/counterAxisSizingMode ──
  //
  // The old mock stored these as free-standing strings and threw unless the node sat
  // in an auto-layout PARENT. Both halves were wrong, and together they hid the P5
  // root diff:
  //   - HUG needs auto-layout on the node ITSELF, not on a parent. Only FILL is a
  //     parent-relative concept. So a standalone auto-layout frame CAN hug — the
  //     root's `layoutSizingVertical: HUG` was never a context artifact.
  //   - On an auto-layout frame these are not storage: they are a projection of
  //     primary/counterAxisSizingMode (HUG ⟺ AUTO), with the axis mapping decided by
  //     layoutMode. Storing them separately let the mock report HUG while the real
  //     sizing mode said FIXED — the exact split the live gate caught.
  //
  /** The sizing-mode field governing `axis`, or null when the node has no auto-layout. */
  private axisField(axis: 'H' | 'V'): 'primaryAxisSizingMode' | 'counterAxisSizingMode' | null {
    const m = this.layoutMode as string | undefined;
    if (!m || m === 'NONE') return null;
    const primary = m === 'VERTICAL' ? 'V' : 'H';
    return axis === primary ? 'primaryAxisSizingMode' : 'counterAxisSizingMode';
  }

  private readSizing(axis: 'H' | 'V'): string | undefined {
    const stored = axis === 'H' ? this._lsh : this._lsv;
    if (stored === 'FILL') return 'FILL'; // parent-relative — not derivable from a mode
    const field = this.axisField(axis);
    if (!field) return stored;
    return this[field] === 'AUTO' ? 'HUG' : 'FIXED';
  }

  private writeSizing(axis: 'H' | 'V', v: string): void {
    const field = this.axisField(axis);
    const name = axis === 'H' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
    if (v === 'FILL') {
      if (!this.inAutoLayout) throw new Error(`${name}: FILL needs an auto-layout parent`);
    } else if (!field && !this.inAutoLayout) {
      throw new Error(`${name}: needs auto-layout on the node or its parent`);
    } else if (v === 'HUG' && !field && this.type !== 'TEXT') {
      // HUG is legal on auto-layout frames AND on text nodes (which hug their glyphs);
      // nothing else can hug.
      throw new Error(`${name}: HUG needs auto-layout on the node itself, or a TEXT node`);
    }
    if (field && v !== 'FILL') this[field] = v === 'HUG' ? 'AUTO' : 'FIXED';
    // FILL COERCES the node's own mode for that axis to FIXED (probed live: a frame
    // set to FILL its parent's counter axis came back counterAxisSizingMode FIXED,
    // having been authored AUTO). The mode is still writable AFTERWARDS — the live
    // probe re-set AUTO and kept FILL — which is what makes the P12 belt possible and
    // what a mock that skipped this coercion could never have shown.
    if (field && v === 'FILL') this[field] = 'FIXED';
    if (axis === 'H') this._lsh = v; else this._lsv = v;
  }

  set layoutSizingHorizontal(v: string) { this.writeSizing('H', v); }
  get layoutSizingHorizontal(): string | undefined { return this.readSizing('H'); }
  set layoutSizingVertical(v: string) { this.writeSizing('V', v); }
  get layoutSizingVertical(): string | undefined { return this.readSizing('V'); }

  // ── strokeWeight: figma.mixed when the four sides differ (IndividualStrokesMixin) ──
  set strokeWeight(v: number) {
    // Assigning the uniform weight RESETS every side — the reason applyStrokes must
    // write per-side weights INSTEAD of, never after, this.
    this._sides = { top: v, right: v, bottom: v, left: v };
  }
  get strokeWeight(): number | symbol {
    const { top, right, bottom, left } = this._sides;
    return top === right && right === bottom && bottom === left
      ? top : (FIGMA_MIXED as unknown as symbol);
  }
  set strokeTopWeight(v: number) { this._sides.top = v; }
  get strokeTopWeight(): number { return this._sides.top; }
  set strokeRightWeight(v: number) { this._sides.right = v; }
  get strokeRightWeight(): number { return this._sides.right; }
  set strokeBottomWeight(v: number) { this._sides.bottom = v; }
  get strokeBottomWeight(): number { return this._sides.bottom; }
  set strokeLeftWeight(v: number) { this._sides.left = v; }
  get strokeLeftWeight(): number { return this._sides.left; }
}

/**
 * Clone a paint and stamp a variable alias onto its color (Figma's paint-copy binding).
 *
 * The bound paint RESOLVES to the variable's value — `paint.color` reads back the
 * variable's colour, not the one that was there before. A mock that left the old
 * colour sitting under the alias would call a rebind "done" while the node still
 * rendered the main's colour, which is the half of a lost binding a user actually
 * SEES. A variable carrying no value in this fixture leaves the paint as it was.
 */
function setBoundVariableForPaint(
  paint: Record<string, unknown>, _field: 'color', variable: FakeVariable,
): Record<string, unknown> {
  const values = Object.values(variable.valuesByMode ?? {});
  const value = values.find((v) => v && typeof v === 'object' && 'r' in (v as object));
  return {
    ...paint,
    ...(value ? { color: value } : {}),
    boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } },
  };
}

/** A Variable, as the plugin API models one: identity + a value per mode.
 * `remote`/`key` are the PUBLISHED (library) variable's identity — Figma sets
 * remote=true and a stable publish key on a variable that lives in another file. */
export interface FakeVariable {
  id: string;
  name: string;
  resolvedType?: string;
  variableCollectionId?: string;
  remote?: boolean;
  key?: string;
  valuesByMode?: Record<string, unknown>;
  setValueForMode?(modeId: string, value: unknown): void;
}

/** The file's LOCAL variables, as getLocalVariablesAsync reports them. A binding
 * to an id absent from this list = the library/remote-variable edge (a library
 * variable is real and bindable in Figma, but this call never lists it). */
let localVariables: FakeVariable[] = [];
export function setMockLocalVariables(vars: FakeVariable[]): void {
  localVariables = vars;
}

/** A local variable that already EXISTS in the file — what a rebuild-from-spec
 * must find by name (spec-005 P6). */
export function makeMockVariable(name: string, resolvedType = 'COLOR'): FakeVariable {
  return { id: `VariableID:${idSeq++}`, name, resolvedType };
}

/** A LOCAL variable that carries a publish key — what the live probe of
 * 25575:353653 actually found bound to the font fields (remote:false + a key).
 * The strict half of the contract: it IS in the local list and DOES answer
 * getVariableByIdAsync, but importVariableByKeyAsync refuses its key (nothing
 * published it), so a rebuild that leans on the import road alone loses it. */
export function makeMockKeyedLocalVariable(name: string, key: string, resolvedType = 'COLOR'): FakeVariable {
  return { id: `VariableID:${idSeq++}`, name, key, remote: false, resolvedType };
}

/** PUBLISHED variables living in a subscribed library. The contract that matters:
 * they are NOT in the local list (getLocalVariablesAsync never reports them — the
 * spec-005 P7 gap), they DO answer getVariableByIdAsync with remote=true + a key,
 * and importVariableByKeyAsync links that same variable back by key. */
let libraryVariables: FakeVariable[] = [];
export function setMockLibraryVariables(vars: FakeVariable[]): void {
  libraryVariables = vars;
}

/** A published library variable: bound by id on the canvas, reattached by key. */
export function makeMockLibraryVariable(name: string, key: string, resolvedType = 'COLOR'): FakeVariable {
  return { id: `VariableID:${idSeq++}`, name, key, remote: true, resolvedType };
}

/** The file's variable COLLECTIONS, as the token-import path finds/creates them. */
interface FakeCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
}
let collections: FakeCollection[] = [];
export function setMockVariableCollections(cols: FakeCollection[]): void {
  collections = cols;
}

function createVariableCollection(name: string): FakeCollection {
  const col: FakeCollection = {
    id: `VariableCollectionId:${idSeq++}`,
    name,
    modes: [{ modeId: `m${idSeq++}`, name: 'Mode 1' }],
  };
  collections.push(col);
  return col;
}

/** figma.variables.createVariable — mints a variable INTO the file's local list. */
function createVariable(name: string, collection: FakeCollection, resolvedType: string): FakeVariable {
  const v: FakeVariable = {
    id: `VariableID:${idSeq++}`,
    name,
    resolvedType,
    variableCollectionId: collection.id,
    valuesByMode: {},
    setValueForMode(modeId: string, value: unknown) {
      (this.valuesByMode as Record<string, unknown>)[modeId] = value;
    },
  };
  localVariables.push(v);
  return v;
}

/** The file's COMPONENT / COMPONENT_SET nodes, as the instance build-case resolves
 * them: by publishable `key` (importComponentByKeyAsync) or node id
 * (getNodeByIdAsync). A ref that matches neither = the unresolvable-main edge. */
let components: FakeNode[] = [];
export function setMockComponents(comps: FakeNode[]): void {
  components = comps;
  // A main is a node too: `getNodeByIdAsync` must answer for it (the componentId
  // fallback when a main is unpublished), and the variant registry is keyed by it.
  for (const c of comps) nodesById.set(c.id, c);
}

/** A COMPONENT the instance build-case can resolve + instantiate. */
export function makeMockComponent(name: string, key?: string): FakeNode {
  const comp = new FakeNode('COMPONENT');
  comp.name = name;
  if (key) comp.key = key;
  return comp;
}

export interface MockFigma {
  mixed: symbol;
  createFrame(): FakeNode;
  createText(): FakeNode;
  createRectangle(): FakeNode;
  createComponent(): FakeNode;
  loadFontAsync(font: FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<Array<{ fontName: FontName }>>;
  getNodeByIdAsync(id: string): Promise<FakeNode | null>;
  importComponentByKeyAsync(key: string): Promise<FakeNode>;
  variables: {
    setBoundVariableForPaint: typeof setBoundVariableForPaint;
    getLocalVariablesAsync(type?: string): Promise<FakeVariable[]>;
    getVariableByIdAsync(id: string): Promise<FakeVariable | null>;
    importVariableByKeyAsync(key: string): Promise<FakeVariable>;
    getLocalVariableCollectionsAsync(): Promise<FakeCollection[]>;
    createVariableCollection(name: string): FakeCollection;
    createVariable(name: string, collection: FakeCollection, type: string): FakeVariable;
  };
}

/** Install a fresh mock on globalThis.figma; returns it. Call once per test file. */
export function installMockFigma(): MockFigma {
  localVariables = [];
  libraryVariables = [];
  collections = [];
  effectStyles = [];
  const mk = (type: string): FakeNode => {
    const n = new FakeNode(type);
    if (type === 'TEXT') n.name = 'Text';
    return n;
  };
  const figma: MockFigma = {
    mixed: FIGMA_MIXED,
    createFrame: () => mk('FRAME'),
    createText: () => mk('TEXT'),
    createRectangle: () => mk('RECTANGLE'),
    createComponent: () => mk('COMPONENT'),
    loadFontAsync: async () => { /* every font "exists" */ },
    listAvailableFontsAsync: async () => [],
    // Components by id, plus every node an instance owns — the live API resolves a
    // compound inner id, and the P12 pre-pass depends on it (probed, not assumed).
    getNodeByIdAsync: async (id: string) =>
      components.find((c) => c.id === id) ?? nodesById.get(id) ?? null,
    importComponentByKeyAsync: async (key: string) => {
      const found = components.find((c) => c.key === key);
      if (!found) throw new Error(`component key not found: ${key}`); // the library-miss edge
      return found;
    },
    variables: {
      setBoundVariableForPaint,
      // Figma filters by resolved type when asked; an untyped fixture variable
      // answers only the untyped query.
      getLocalVariablesAsync: async (type?: string) =>
        (type ? localVariables.filter((v) => v.resolvedType === type) : localVariables),
      // Answers for LOCAL and REMOTE alike — the one call that can see a published
      // variable at all, and therefore the only source of its publish key.
      getVariableByIdAsync: async (id: string) =>
        [...localVariables, ...libraryVariables].find((v) => v.id === id) ?? null,
      importVariableByKeyAsync: async (key: string) => {
        const found = libraryVariables.find((v) => v.key === key);
        if (!found) throw new Error(`variable key not found: ${key}`); // unpublished / unsubscribed
        return found; // LINKS the same variable — never a copy, never a new local var
      },
      getLocalVariableCollectionsAsync: async () => collections,
      createVariableCollection,
      createVariable,
    },
  };
  (globalThis as unknown as { figma: MockFigma }).figma = figma;
  return figma;
}
