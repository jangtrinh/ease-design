// spec-005 SPIKE — reversibility proof for the Figma component representation.
// Runs the REAL forward builder (executor-frame.createFigmaNode) against a mock
// `figma` global, then the reverse-walker (scan-node.nodeToSpec), and asks the
// central question: is `spec → node → spec` a FIXED POINT?
//
// Definition used: idempotence of (nodeToSpec ∘ createFigmaNode) on its OWN output.
// spec0 (authored) → node1 → spec1 → node2 → spec2. A field "survives" iff
// spec1 === spec2 (the build/normalisation settles after one pass). The spec0→spec1
// delta is normalisation (defaults materialised), reported but not a failure.
//
// RESULT SUMMARY (asserted below):
//   SURVIVE (fixed point): auto-layout topology (mode/spacing/padding/sizing/align),
//     GRID counts+gaps, fills+alpha, corner radius (uniform & per-corner), strokes,
//     child self-sizing (HUG/FILL/FIXED), text chars/size/family/weight/colour/align,
//     and — since spec-005 P1 — variable bindings, via the token NAME: the walker
//     joins each bound variable id against the file's id→name map and re-emits
//     tokenRefs, which the build path rebinds by name (fill/textColor/stroke/radius/
//     gap/uniform padding).
//     Since spec-005 P2, INSTANCE nodes are also a fixed point — as ref + overrides:
//     the main-component link (componentKey/componentId), the variant + component
//     PROPERTY values, and the node-level overrides the payload models (size, fills,
//     radius, opacity) all come back. The inner composition is deliberately NOT
//     captured — it belongs to the main, which the rebuild instantiates.
//   DO NOT SURVIVE (documented gaps):
//     - library / remote variable bindings: the id is not in the file's LOCAL
//       variables, so no token name is recoverable → the binding is reported as a raw
//       id in figmaScanBindings (visible, not silent) and a rebuild drops it.
//     - per-side (non-uniform) padding bindings: tokenRefs models uniform padding
//       only → no slot to carry them back.
//     - an instance's INNER (per-child) ad-hoc overrides — e.g. a text edited inside
//       the instance without a component property: ref+overrides has no slot for them.
//       Reported in figmaScanInnerOverrides (visible), dropped by a rebuild. (P2 edge)
//     - an instance whose main resolves to NOTHING (unpublished library component,
//       main in another file): degrades to a plain frame + an import warning. (P2 edge)
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockLocalVariables, setMockComponents, makeMockComponent, FakeNode,
} from './helpers/mock-figma.ts';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';
import { getImportWarnings, resetImportWarnings } from '../plugin/src/main/executor-styles.ts';
import type { FigmaExportNode } from '../shared/figma-payload-types.ts';
import type { ScannedNode } from '../plugin/src/main/scan-node.ts';

// Install the mock BEFORE any builder call (executors read `figma` at call time).
beforeAll(() => { installMockFigma(); });

// Imported lazily inside tests would also work; static import is safe because the
// executor modules only touch `figma` inside function bodies.
const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec, readTokenNameMap } = await import('../plugin/src/main/scan-node.ts');

type Vars = Map<string, { id: string; name: string }>;

/** The file's id→name token map, as readTokenNameMap would produce it live. */
const namesOf = (vars?: Vars): Map<string, string> =>
  new Map([...(vars?.values() ?? [])].map((v) => [v.id, v.name]));

async function build(spec: FigmaExportNode, vars?: Vars, tokenNames = namesOf(vars)): Promise<ScannedNode> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), vars as any);
  if (!node) throw new Error('builder returned null');
  return nodeToSpec(node, tokenNames);
}

/**
 * One round of forward+reverse; returns [spec1, spec2] to check the fixed point.
 * Both passes see the SAME token collection — a rebuild happens in a file whose
 * variables exist, so withholding them would test a different question.
 */
async function roundTrips(spec0: FigmaExportNode, vars?: Vars): Promise<[ScannedNode, ScannedNode]> {
  const spec1 = await build(spec0, vars);
  const spec2 = await build(spec1, vars);
  return [spec1, spec2];
}

/**
 * The fixed-point assertion, made through the SAME linter the live gate uses —
 * `structuralDiff` (cli/src/util/structural-diff.ts), which `figma-agent
 * mirror-verify` runs against a real canvas. Asserting both here is the point: a
 * spec this suite calls a fixed point is one mirror-verify must also call `equal`,
 * so the mock proof and the live proof can never drift into disagreeing. `toEqual`
 * stays alongside as the independent second opinion.
 */
function expectFixedPoint(spec1: ScannedNode, spec2: ScannedNode): void {
  const { equal, diffs } = structuralDiff(spec1, spec2);
  expect(diffs).toEqual([]); // fails with the exact path, not just `false`
  expect(equal).toBe(true);
  expect(spec2).toEqual(spec1);
}

describe('fixed point — auto-layout FRAME with text children', () => {
  const card: FigmaExportNode = {
    type: 'FRAME', name: 'Card', width: 320, height: 200,
    layoutMode: 'VERTICAL', itemSpacing: 12,
    paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
    primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'FIXED',
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER',
    fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12, a: 1 } }],
    cornerRadius: 12,
    strokes: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.1 } }],
    strokeWeight: 1, strokeAlign: 'INSIDE',
    children: [
      { type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 20, fontWeight: 700, textAutoResize: 'WIDTH_AND_HEIGHT', textColor: { r: 1, g: 1, b: 1, a: 1 } },
      { type: 'TEXT', name: 'Body', characters: 'World', fontSize: 14, fontWeight: 400, textAutoResize: 'WIDTH_AND_HEIGHT', textColor: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
    ],
  };

  it('reaches a fixed point (spec1 === spec2)', async () => {
    const [spec1, spec2] = await roundTrips(card);
    expectFixedPoint(spec1, spec2);
  });

  it('preserves auto-layout topology, fills, radius, strokes', async () => {
    const [s] = await roundTrips(card);
    expect(s).toMatchObject({
      type: 'FRAME', name: 'Card', width: 320, height: 200,
      layoutMode: 'VERTICAL', itemSpacing: 12,
      paddingTop: 16, paddingLeft: 16,
      primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'FIXED',
      counterAxisAlignItems: 'CENTER', cornerRadius: 12,
      strokeWeight: 1, strokeAlign: 'INSIDE',
    });
    expect(s.fills?.[0]).toMatchObject({ type: 'SOLID', color: { r: 0.1, a: 1 } });
    // stroke alpha (0.1) survived the paint.opacity ↔ color.a hop
    expect(s.strokes?.[0]?.color?.a).toBeCloseTo(0.1, 5);
  });

  it('preserves text content + weight + colour, and materialises child self-sizing', async () => {
    const [s] = await roundTrips(card);
    const title = s.children?.[0];
    expect(title).toMatchObject({ type: 'TEXT', characters: 'Hello', fontSize: 20, fontWeight: 700 });
    expect(title?.textColor).toMatchObject({ r: 1, g: 1, b: 1 });
    // VERTICAL parent → text children are hugged on the main axis (build convention)
    expect(title?.layoutSizingHorizontal).toBe('HUG');
  });

  it('does NOT capture the ROOT frame own sizing (no auto-layout parent)', async () => {
    const [s] = await roundTrips(card);
    expect(s.layoutSizingHorizontal).toBeUndefined();
    expect(s.layoutSizingVertical).toBeUndefined();
  });
});

describe('fixed point — native GRID', () => {
  const grid: FigmaExportNode = {
    type: 'FRAME', name: 'Grid', width: 600, height: 400, layoutMode: 'GRID',
    gridColumnCount: 3, gridRowCount: 2, gridColumnGap: 16, gridRowGap: 16,
    paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8,
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
  };
  it('round-trips grid counts + gaps', async () => {
    const [spec1, spec2] = await roundTrips(grid);
    expectFixedPoint(spec1, spec2);
    expect(spec1).toMatchObject({
      layoutMode: 'GRID', gridColumnCount: 3, gridRowCount: 2, gridColumnGap: 16, gridRowGap: 16,
    });
  });
});

describe('fixed point — per-corner radius (figma.mixed path)', () => {
  const chip: FigmaExportNode = {
    type: 'FRAME', name: 'Chip', width: 80, height: 32, layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO',
    cornerRadii: { tl: 16, tr: 4, br: 16, bl: 4 },
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
  };
  it('recovers cornerRadii via the mixed-getter fallback', async () => {
    const [spec1, spec2] = await roundTrips(chip);
    expectFixedPoint(spec1, spec2);
    expect(spec1.cornerRadii).toEqual({ tl: 16, tr: 4, br: 16, bl: 4 });
    expect(spec1.cornerRadius).toBeUndefined();
  });
});

describe('fixed point — variable bindings survive via the token NAME (spec-005 P1)', () => {
  const btn: FigmaExportNode = {
    type: 'FRAME', name: 'Btn', width: 120, height: 40, layoutMode: 'HORIZONTAL',
    itemSpacing: 8, paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 12,
    primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO',
    fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.2, b: 0.9, a: 1 } }],
    strokes: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.2 } }], strokeWeight: 1,
    cornerRadius: 8,
    tokenRefs: {
      fill: 'color/brand', stroke: 'color/border', radius: 'radius/sm',
      gap: 'space/sm', padding: 'space/md',
    },
    children: [
      {
        type: 'TEXT', name: 'Label', characters: 'Go', fontSize: 14,
        textAutoResize: 'WIDTH_AND_HEIGHT', textColor: { r: 1, g: 1, b: 1, a: 1 },
        tokenRefs: { textColor: 'color/on-brand' },
      },
    ],
  };
  const vars: Vars = new Map([
    ['color/brand', { id: 'VariableID:1', name: 'color/brand' }],
    ['radius/sm', { id: 'VariableID:2', name: 'radius/sm' }],
    ['color/border', { id: 'VariableID:3', name: 'color/border' }],
    ['space/sm', { id: 'VariableID:4', name: 'space/sm' }],
    ['space/md', { id: 'VariableID:5', name: 'space/md' }],
    ['color/on-brand', { id: 'VariableID:6', name: 'color/on-brand' }],
  ]);

  it('recovers every bound field as a token NAME, not just an id', async () => {
    const spec1 = await build(btn, vars);
    expect(spec1.tokenRefs).toEqual({
      fill: 'color/brand', stroke: 'color/border', radius: 'radius/sm',
      gap: 'space/sm', padding: 'space/md',
    });
    // The raw ids stay recorded alongside (uniform padding → all four sides bound).
    expect(spec1.figmaScanBindings).toMatchObject({
      fills: 'VariableID:1', strokes: 'VariableID:3',
      cornerRadius: 'VariableID:2', itemSpacing: 'VariableID:4',
      paddingTop: 'VariableID:5', paddingLeft: 'VariableID:5',
    });
  });

  it('recovers a TEXT colour binding as textColor (build-path convention)', async () => {
    const [spec1] = await roundTrips(btn, vars);
    expect(spec1.children?.[0]?.tokenRefs).toEqual({ textColor: 'color/on-brand' });
  });

  it('IS a fixed point — the rebuilt node carries the same bindings (spec1 === spec2)', async () => {
    const [spec1, spec2] = await roundTrips(btn, vars);
    expect(spec2.tokenRefs).toEqual(spec1.tokenRefs);
    expect(spec2.figmaScanBindings).toEqual(spec1.figmaScanBindings);
    expectFixedPoint(spec1, spec2);
  });

  it('reads the id→name map from the file LOCAL variables (the live join source)', async () => {
    setMockLocalVariables([{ id: 'VariableID:1', name: 'color/brand' }]);
    const map = await readTokenNameMap();
    expect(map.get('VariableID:1')).toBe('color/brand');
    setMockLocalVariables([]);
  });
});

describe('reversibility GAP that REMAINS — library / remote variable bindings', () => {
  const card: FigmaExportNode = {
    type: 'FRAME', name: 'LibCard', width: 100, height: 40, layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO',
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
    tokenRefs: { fill: 'lib/color/primary' },
  };
  const vars: Vars = new Map([['lib/color/primary', { id: 'VariableID:9', name: 'lib/color/primary' }]]);

  it('reports the binding as a raw id — a library variable has no LOCAL name to join', async () => {
    // getLocalVariablesAsync does not list library variables → empty join map.
    const spec1 = await build(card, vars, new Map());
    expect(spec1.figmaScanBindings).toEqual({ fills: 'VariableID:9' });
    expect(spec1.tokenRefs).toBeUndefined(); // no name recovered → nothing to rebind
  });

  it('is NOT a fixed point — the rebuild loses the library binding (loss is visible, not silent)', async () => {
    const spec1 = await build(card, vars, new Map());
    const spec2 = await build(spec1, vars, new Map());
    expect(spec2.figmaScanBindings).toBeUndefined();
    expect(spec2).not.toEqual(spec1);
    // …and the linter the live gate runs names WHICH field was lost, by path.
    expect(structuralDiff(spec1, spec2).diffs).toEqual([
      { path: 'figmaScanBindings', left: { fills: 'VariableID:9' }, right: undefined },
    ]);
  });
});

describe('reversibility GAP that REMAINS — per-side (non-uniform) padding binding', () => {
  it('leaves a single bound padding side as a raw id (tokenRefs models uniform padding only)', async () => {
    const frame = new FakeNode('FRAME');
    frame.name = 'PadOnTop';
    frame.resize(100, 40);
    frame.layoutMode = 'VERTICAL';
    frame.paddingTop = 12;
    frame.setBoundVariable('paddingTop', { id: 'VariableID:5' });

    const spec1 = nodeToSpec(frame as unknown as SceneNode, new Map([['VariableID:5', 'space/md']]));
    expect(spec1.figmaScanBindings).toEqual({ paddingTop: 'VariableID:5' });
    expect(spec1.tokenRefs).toBeUndefined();
  });
});

// ── spec-005 P2: instances ────────────────────────────────────────────────
// The main component every instance test instantiates. It carries the visuals an
// instance MIRRORS (so a rebuild that resolves the main gets them for free) and a
// State variant property.
function mainButton(): FakeNode {
  const comp = makeMockComponent('Button/Primary', 'KEY-BTN');
  comp.resize(120, 40);
  comp.layoutMode = 'HORIZONTAL';
  comp.itemSpacing = 8;
  comp.primaryAxisSizingMode = 'AUTO';
  comp.counterAxisSizingMode = 'AUTO';
  comp.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.2, b: 0.9 }, opacity: 1 }];
  comp.cornerRadius = 8;
  comp.componentPropertyDefinitions = { State: { type: 'VARIANT', defaultValue: 'Default' } };
  comp.componentProperties = { State: { type: 'VARIANT', value: 'Default' } };
  const label = new FakeNode('TEXT');
  label.name = 'Label';
  label.characters = 'Click';
  comp.appendChild(label);
  return comp;
}

describe('fixed point — INSTANCE survives as ref + overrides (spec-005 P2)', () => {
  let main: FakeNode;
  beforeEach(() => {
    main = mainButton();
    setMockComponents([main]);
    resetImportWarnings();
  });

  const instSpec = (over: Partial<FigmaExportNode> = {}): FigmaExportNode => ({
    type: 'INSTANCE', name: 'Button/Primary', componentKey: 'KEY-BTN',
    componentProperties: { State: 'Hover' }, ...over,
  });

  it('rebuilds a real INSTANCE (not a frame) and keeps the main-component link', async () => {
    const spec1 = await build(instSpec());
    expect(spec1.type).toBe('INSTANCE');
    expect(spec1.componentKey).toBe('KEY-BTN');
    expect(spec1.componentId).toBe(main.id);
    expect(spec1.componentName).toBe('Button/Primary');
    // Inner composition is NOT captured — it is the main's, and createInstance rebuilds it.
    expect(spec1.children).toBeUndefined();
  });

  it('keeps the variant / component property values', async () => {
    const [spec1, spec2] = await roundTrips(instSpec());
    expect(spec1.componentProperties).toEqual({ State: 'Hover' });
    expect(spec2.componentProperties).toEqual({ State: 'Hover' });
  });

  it('IS a fixed point (spec1 === spec2)', async () => {
    const [spec1, spec2] = await roundTrips(instSpec());
    expectFixedPoint(spec1, spec2);
  });

  it('mirrors the main visuals without re-writing them as overrides', async () => {
    const spec1 = await build(instSpec());
    // Read back off the instance: they came from the main via createInstance.
    expect(spec1).toMatchObject({ width: 120, height: 40, layoutMode: 'HORIZONTAL', itemSpacing: 8, cornerRadius: 8 });
    expect(spec1.fills?.[0]).toMatchObject({ type: 'SOLID', color: { r: 0.5, g: 0.2, b: 0.9, a: 1 } });
  });

  it('round-trips node-level overrides that DIFFER from the main (fill, size, radius)', async () => {
    const overridden = instSpec({
      width: 200, height: 48, cornerRadius: 24,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    const [spec1, spec2] = await roundTrips(overridden);
    expect(spec1).toMatchObject({ type: 'INSTANCE', width: 200, height: 48, cornerRadius: 24 });
    expect(spec1.fills?.[0]?.color).toMatchObject({ r: 1, g: 0, b: 0 });
    expectFixedPoint(spec1, spec2);
  });

  it('resolves the main by componentId when no key is published', async () => {
    const local = mainButton();
    delete local.key; // an unpublished local component has no key
    setMockComponents([local]);
    const spec1 = await build({ type: 'INSTANCE', name: 'Local', componentId: local.id });
    expect(spec1.type).toBe('INSTANCE');
    expect(spec1.componentId).toBe(local.id);
    expect(spec1.componentKey).toBeUndefined();
  });

  it('survives as a CHILD of an auto-layout frame (the real registry shape)', async () => {
    const card: FigmaExportNode = {
      type: 'FRAME', name: 'Card', width: 320, height: 120, layoutMode: 'VERTICAL',
      itemSpacing: 12, primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'FIXED',
      children: [
        { type: 'TEXT', name: 'Title', characters: 'Hi', fontSize: 16, textAutoResize: 'WIDTH_AND_HEIGHT' },
        instSpec(),
      ],
    };
    const [spec1, spec2] = await roundTrips(card);
    expect(spec1.children?.[1]).toMatchObject({
      type: 'INSTANCE', componentKey: 'KEY-BTN', componentProperties: { State: 'Hover' },
    });
    expectFixedPoint(spec1, spec2);
  });
});

describe('instance EDGE — a property the main does not expose', () => {
  beforeEach(() => { setMockComponents([mainButton()]); resetImportWarnings(); });

  it('still builds the instance, on the main defaults, and warns (no silent loss)', async () => {
    const spec1 = await build({
      type: 'INSTANCE', name: 'Button/Primary', componentKey: 'KEY-BTN',
      componentProperties: { Size: 'Large' }, // renamed/removed on the main
    });
    expect(spec1.type).toBe('INSTANCE');
    expect(spec1.componentProperties).toEqual({ State: 'Default' }); // the main's default
    expect(getImportWarnings().join('\n')).toContain('setProperties failed');
  });
});

describe('instance GAP that REMAINS — main component not resolvable', () => {
  beforeEach(() => { setMockComponents([]); resetImportWarnings(); });

  it('degrades to a plain frame + warns; the component link is lost (visible, not silent)', async () => {
    const spec1 = await build({
      type: 'INSTANCE', name: 'Ghost', width: 100, height: 40, componentKey: 'KEY-GONE',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    expect(spec1.type).toBe('FRAME');            // degraded — the pre-P2 behaviour
    expect(spec1.componentKey).toBeUndefined();  // the link did not survive
    expect(spec1).toMatchObject({ name: 'Ghost', width: 100, height: 40 }); // visuals still land
    expect(getImportWarnings().join('\n')).toContain('component link lost');
  });
});

describe('instance GAP that REMAINS — INNER (per-child) ad-hoc overrides', () => {
  it('reports them in figmaScanInnerOverrides; a rebuild drops them', async () => {
    const main = mainButton();
    setMockComponents([main]);
    const inst = main.createInstance();
    // Figma reports one entry per overridden node; the entry for the instance ITSELF
    // is node-level (modelled + re-applied) — only the CHILD entries are the gap.
    inst.overrides = [
      { id: inst.id, overriddenFields: ['fills'] },
      { id: `${inst.id};child`, overriddenFields: ['characters', 'fontSize'] },
    ];

    const spec1 = nodeToSpec(inst as unknown as SceneNode);
    expect(spec1.figmaScanInnerOverrides).toEqual(['characters', 'fontSize']); // deduped + sorted
    expect(spec1.figmaScanBindings).toBeUndefined();

    // Rebuild: the instance comes back, its inner edits do not.
    const spec2 = await build(spec1);
    expect(spec2.type).toBe('INSTANCE');
    expect(spec2.figmaScanInnerOverrides).toBeUndefined();
    expect(spec2).not.toEqual(spec1); // NOT a fixed point — the loss is reported, not faked
    expect(structuralDiff(spec1, spec2).diffs).toEqual([
      { path: 'figmaScanInnerOverrides', left: ['characters', 'fontSize'], right: undefined },
    ]);
  });
});
