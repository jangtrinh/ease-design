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
// It does NOT emulate Figma's layout re-flow (a child's FILL coercing the parent's
// sizing mode). That is exactly the class of loss the LIVE half must confirm.

let idSeq = 0;
export const FIGMA_MIXED = Symbol('figma.mixed');

type Corners = { tl: number; tr: number; br: number; bl: number };

export class FakeNode {
  id = `S:${idSeq++}`;
  name = 'Node';
  type: string;
  width = 0;
  height = 0;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  boundVariables: Record<string, unknown> = {};
  private _corners: Corners = { tl: 0, tr: 0, br: 0, bl: 0 };
  private _lsh: string | undefined;
  private _lsv: string | undefined;
  [key: string]: unknown;

  constructor(type: string) {
    this.type = type;
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

/** The file's LOCAL variables, as getLocalVariablesAsync reports them. A binding
 * to an id absent from this list = the library/remote-variable edge. */
let localVariables: Array<{ id: string; name: string }> = [];
export function setMockLocalVariables(vars: Array<{ id: string; name: string }>): void {
  localVariables = vars;
}

export interface MockFigma {
  mixed: symbol;
  createFrame(): FakeNode;
  createText(): FakeNode;
  createRectangle(): FakeNode;
  loadFontAsync(font: FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<Array<{ fontName: FontName }>>;
  variables: {
    setBoundVariableForPaint: typeof setBoundVariableForPaint;
    getLocalVariablesAsync(): Promise<Array<{ id: string; name: string }>>;
  };
}

/** Install a fresh mock on globalThis.figma; returns it. Call once per test file. */
export function installMockFigma(): MockFigma {
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
    loadFontAsync: async () => { /* every font "exists" */ },
    listAvailableFontsAsync: async () => [],
    variables: {
      setBoundVariableForPaint,
      getLocalVariablesAsync: async () => localVariables,
    },
  };
  (globalThis as unknown as { figma: MockFigma }).figma = figma;
  return figma;
}
