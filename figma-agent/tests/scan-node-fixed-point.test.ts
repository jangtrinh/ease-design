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
//     child self-sizing (HUG/FILL/FIXED), text chars/size/family/weight/colour/align.
//   DO NOT SURVIVE (documented gaps):
//     - variable bindings: recovered as a variable *id*, never as the token *name*
//       tokenRefs needs → tokenRefs is dropped, so a rebuild loses the binding.
//     - instance / component references: FigmaExportNode has no instance type and
//       createFigmaNode has no instance build-case → an INSTANCE degrades to a plain
//       FRAME and its inner composition is not recursed.
import { describe, it, expect, beforeAll } from 'vitest';
import { installMockFigma, FakeNode } from './helpers/mock-figma.ts';
import type { FigmaExportNode } from '../shared/figma-payload-types.ts';
import type { ScannedNode } from '../plugin/src/main/scan-node.ts';

// Install the mock BEFORE any builder call (executors read `figma` at call time).
beforeAll(() => { installMockFigma(); });

// Imported lazily inside tests would also work; static import is safe because the
// executor modules only touch `figma` inside function bodies.
const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec } = await import('../plugin/src/main/scan-node.ts');

type Vars = Map<string, { id: string; name: string }>;

async function build(spec: FigmaExportNode, vars?: Vars): Promise<ScannedNode> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), vars as any);
  if (!node) throw new Error('builder returned null');
  return nodeToSpec(node);
}

/** One round of forward+reverse; returns [spec1, spec2] to check the fixed point. */
async function roundTrips(spec0: FigmaExportNode, vars?: Vars): Promise<[ScannedNode, ScannedNode]> {
  const spec1 = await build(spec0, vars);
  const spec2 = await build(spec1); // second pass, no vars — bindings cannot rebuild
  return [spec1, spec2];
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
    expect(spec2).toEqual(spec1);
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
    expect(spec2).toEqual(spec1);
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
    expect(spec2).toEqual(spec1);
    expect(spec1.cornerRadii).toEqual({ tl: 16, tr: 4, br: 16, bl: 4 });
    expect(spec1.cornerRadius).toBeUndefined();
  });
});

describe('reversibility GAP — variable bindings do not survive', () => {
  const btn: FigmaExportNode = {
    type: 'FRAME', name: 'Btn', width: 120, height: 40, layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO',
    fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.2, b: 0.9, a: 1 } }],
    cornerRadius: 8,
    tokenRefs: { fill: 'color/brand', radius: 'radius/sm' },
  };
  const vars: Vars = new Map([
    ['color/brand', { id: 'VariableID:1', name: 'color/brand' }],
    ['radius/sm', { id: 'VariableID:2', name: 'radius/sm' }],
  ]);

  it('detects the binding as a variable id but drops tokenRefs (name unrecoverable)', async () => {
    const spec1 = await build(btn, vars);
    expect(spec1.figmaScanBindings).toEqual({ fills: 'VariableID:1', cornerRadius: 'VariableID:2' });
    expect(spec1.tokenRefs).toBeUndefined(); // the token NAME is gone
  });

  it('is NOT a fixed point — rebuilding spec1 loses the binding entirely', async () => {
    const spec1 = await build(btn, vars);
    const spec2 = await build(spec1); // no tokenRefs on spec1 → nothing to bind
    expect(spec2.figmaScanBindings).toBeUndefined();
    expect(spec2).not.toEqual(spec1);
  });
});

describe('reversibility GAP — instance / component references do not survive', () => {
  it('degrades an INSTANCE to a FRAME and does not recurse its composition', async () => {
    const inst = new FakeNode('INSTANCE');
    inst.name = 'Button/Primary';
    inst.resize(120, 40);
    inst.layoutMode = 'HORIZONTAL';
    inst.itemSpacing = 8;
    inst.primaryAxisSizingMode = 'AUTO';
    inst.mainComponent = { id: 'C:99' };
    const label = new FakeNode('TEXT');
    label.characters = 'Click';
    inst.appendChild(label);

    const spec1 = nodeToSpec(inst as unknown as SceneNode);
    expect(spec1.type).toBe('FRAME');                 // no INSTANCE type in the schema
    expect(spec1.figmaScanSourceType).toBe('INSTANCE'); // detected, but only as metadata
    expect(spec1.figmaScanMainComponent).toBe('C:99');
    expect(spec1.children).toBeUndefined();            // composition NOT recursed (audit rule)

    // Rebuild → a plain frame; the instance identity is gone.
    const spec2 = await build(spec1);
    expect(spec2.figmaScanSourceType).toBeUndefined();
    expect(spec2.type).toBe('FRAME');
  });
});
