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
// It does NOT emulate Figma's layout re-flow (a child's FILL coercing the parent's
// sizing mode), nor `InstanceNode.overrides` bookkeeping (tests set it by hand).
// Those are exactly the classes of loss the LIVE half (P5) must confirm.

let idSeq = 0;
export const FIGMA_MIXED = Symbol('figma.mixed');

type Corners = { tl: number; tr: number; br: number; bl: number };

export class FakeNode {
  id = `S:${idSeq++}`;
  type: string;
  width = 0;
  height = 0;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  boundVariables: Record<string, unknown> = {};
  private _corners: Corners = { tl: 0, tr: 0, br: 0, bl: 0 };
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

  /** InstanceNode.getMainComponentAsync — the ONLY way to reach the main live. */
  async getMainComponentAsync(): Promise<{ id?: string; key?: string; name?: string } | null> {
    return this._main;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  appendChild(child: FakeNode): void {
    child.parent = this;
    this.children.push(child);
  }

  setBoundVariable(field: string, variable: { id: string }): void {
    this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
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
    return inst;
  }

  /** InstanceNode.setProperties — throws on a property the main doesn't expose. */
  setProperties(props: Record<string, string | boolean>): void {
    const defs = this.componentPropertyDefinitions as Record<string, unknown> | undefined;
    const current = (this.componentProperties as Record<string, { value: unknown }>) ?? {};
    const next: Record<string, { type: string; value: unknown }> = { ...(current as never) };
    for (const [k, v] of Object.entries(props)) {
      if (defs && !(k in defs)) throw new Error(`property "${k}" not found on the main component`);
      next[k] = { type: 'VARIANT', value: v };
    }
    this.componentProperties = next;
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

  // ── layoutSizing: only settable inside an auto-layout parent (Figma throws otherwise) ──
  set layoutSizingHorizontal(v: string) {
    if (!this.inAutoLayout) throw new Error('layoutSizingHorizontal needs an auto-layout parent');
    this._lsh = v;
  }
  get layoutSizingHorizontal(): string | undefined { return this._lsh; }
  set layoutSizingVertical(v: string) {
    if (!this.inAutoLayout) throw new Error('layoutSizingVertical needs an auto-layout parent');
    this._lsv = v;
  }
  get layoutSizingVertical(): string | undefined { return this._lsv; }
}

/** Clone a paint and stamp a variable alias onto its color (Figma's paint-copy binding). */
function setBoundVariableForPaint(paint: Record<string, unknown>, _field: 'color', variable: { id: string }): Record<string, unknown> {
  return { ...paint, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } } };
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
    getNodeByIdAsync: async (id: string) => components.find((c) => c.id === id) ?? null,
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
