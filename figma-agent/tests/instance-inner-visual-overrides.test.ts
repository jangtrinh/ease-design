// spec-005 P15 — the VISUAL inner-override layer, and the four field classes the
// live gate (25579:749755, "IAM · Roles & permissions — List") lost on every scan.
//
// LIVE EVIDENCE (scratchpad/p15-evidence-effects.json + p15-evidence-visual.json,
// read-only probes of the node the owner edited). Figma reports 16 inner overrides on
// it; the rebuild reproduced 7. Every one of the 9 missing entries is visual:
//
//   25575:353434;25575:350821            fills          (bound → VariableID:25573:35878)
//   …;25575:350821;5198:1226             fills          (bound → VariableID:25573:35875)
//   …;25575:350829;5198:1124             fills          (bound → VariableID:5140:17717)
//   25575:353434;25576:494804/805/806    visible: false
//   25575:353481                         effectStyleId  ("inset-shadow/2xs", local)
//   25575:353482;25579:744215            effectStyleId  ("shadow/2xl", local)
//   25575:353482;25579:746648            effectStyleId + effects — BOTH CLEARED
//
// Three facts the probe settled, and this suite encodes each as its own test:
//   1. EVERY overridden `fills` on that node is variable-BOUND. Capturing the resolved
//      literal and writing it back is the P14 clobber, one layer down.
//   2. An override can CLEAR (`effects: []`, `effectStyleId: ''`) — 25579:746648's main
//      has a shadow the user removed. A capture that drops empty rebuilds it.
//   3. A DS shadow reaches a node through a STYLE, and the style's effects are bound
//      five ways (colour/radius/spread/offsetX/offsetY). The link is what must travel.
//
// The mock derives `overrides` by diffing against the main (see mock-figma note 11),
// so what these tests assert is what Figma's own bookkeeping reports — and its
// effect-style API refuses the way the live one does: the sync setter throws under
// dynamic-page, and a literal effects write DETACHES the style.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockComponents, setMockEffectStyles, setMockLocalVariables,
  makeMockKeyedLocalVariable, FakeNode, type FakeVariable,
} from './helpers/mock-figma.ts';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';
import { getImportWarnings, resetImportWarnings } from '../plugin/src/main/executor-styles.ts';
import type { FigmaExportNode } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec, readMainComponentMap, readKeyedVariableMap } = await import('../plugin/src/main/scan-node.ts');
const { resetKeyedVariableCache } = await import('../plugin/src/main/executor-keyed-vars.ts');

/** The full scan, keyed-variable pre-pass included — without it a bound inner paint
 * has no key to travel by, which is half of what P15 fixes. */
const scan = async (node: FakeNode) => nodeToSpec(
  node as unknown as SceneNode,
  new Map(),
  await readMainComponentMap(node as unknown as SceneNode),
  await readKeyedVariableMap(node as unknown as SceneNode),
);

const build = async (spec: FigmaExportNode) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map());
  if (!node) throw new Error('builder returned null');
  return { node: node as unknown as FakeNode, spec: await scan(node as unknown as FakeNode) };
};

/** The alias a paint-copy binding leaves on the first paint's color. */
const fillAliasOf = (node: unknown): string | undefined =>
  (node as { fills?: Array<{ boundVariables?: { color?: { id: string } } }> })
    .fills?.[0]?.boundVariables?.color?.id;

const solid = (r: number, g: number, b: number, alias?: string) => ({
  type: 'SOLID',
  color: { r, g, b },
  ...(alias ? { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: alias } } } : {}),
});

/** The live `shadow/2xl`: a DS shadow whose every dimension is variable-bound. */
const SHADOW_2XL = [{
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: { x: 0, y: 25 },
  radius: 50,
  spread: -12,
  visible: true,
  blendMode: 'NORMAL',
  boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:17021:258197' } },
}];

let accent: FakeVariable;
let main: FakeNode;

/**
 * A main shaped like the gate's own sidebar: a menu button whose label's fill is
 * bound, an indicator rectangle, and a card that carries a shadow through a style.
 */
function mainShell(): FakeNode {
  const comp = new FakeNode('COMPONENT');
  comp.name = 'Shell/Sidebar';
  comp.key = 'KEY-SHELL';
  comp.width = 240;
  comp.height = 836;

  const label = new FakeNode('TEXT');
  label.name = 'Menu Item';
  label.characters = 'User';
  label.fontSize = 14;
  label.fills = [solid(0, 0, 0, accent.id)];
  comp.appendChild(label);

  const indicator = new FakeNode('RECTANGLE');
  indicator.name = 'Active indicator';
  indicator.visible = true;
  indicator.fills = [solid(0.88, 0, 0.15)];
  comp.appendChild(indicator);

  const card = new FakeNode('FRAME');
  card.name = 'Table card';
  card.width = 200;
  card.height = 100;
  comp.appendChild(card);

  return comp;
}

/** The main the fixtures instantiate — registered, so a rebuild resolves the same one. */
beforeEach(() => {
  resetImportWarnings();
  resetKeyedVariableCache();
  accent = makeMockKeyedLocalVariable('tailwind colors/accent', 'KEY-ACCENT');
  setMockLocalVariables([accent]);
  setMockEffectStyles([{ id: 'S:shadow2xl,', name: 'shadow/2xl', effects: SHADOW_2XL }]);
  main = mainShell();
  setMockComponents([main]);
});

describe('spec-005 P15 — an inner child\'s VISUAL overrides', () => {
  it('round-trips a cleared `visible` flag (live: the three Active indicators)', async () => {
    const inst = main.createInstance();
    inst.children[1].visible = false;

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['visible']);
    expect(spec1.innerOverrides?.[0]?.visual).toEqual({ visible: false });

    // The whole bug: before P15 this came back with no inner override at all.
    const { spec: spec2 } = await build(spec1);
    expect(spec2.figmaScanInnerOverrides).toEqual(['visible']);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  it('rebinds a BOUND inner fill by key rather than writing the literal it resolved to', async () => {
    // The live shape: the override is a DIFFERENT bound colour, not a raw one.
    const brand = makeMockKeyedLocalVariable('tailwind colors/brand', 'KEY-BRAND');
    brand.valuesByMode = { '1:0': { r: 0.88, g: 0, b: 0.15 } };
    setMockLocalVariables([accent, brand]);
    const inst = main.createInstance();
    inst.children[0].fills = [solid(0.88, 0, 0.15, brand.id)];

    const spec1 = await scan(inst);
    expect(spec1.innerOverrides?.[0]?.visual?.keyedBindings).toEqual({
      fills: { key: 'KEY-BRAND', name: 'tailwind colors/brand' },
    });

    const { node, spec: spec2 } = await build(spec1);
    // THE POINT: the rebuilt child is BOUND, not merely the right colour. A literal
    // write would pass an eyeball test and freeze the node at today's value.
    expect(fillAliasOf(node.children[0])).toBe(brand.id);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });

  it('replays an effect-style LINK, not the shadows the style resolved to', async () => {
    const inst = main.createInstance();
    await inst.children[2].setEffectStyleIdAsync('S:shadow2xl,');

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['effectStyleId', 'effects']);
    expect(spec1.innerOverrides?.[0]?.visual?.effectStyleId).toBe('S:shadow2xl,');

    const { node, spec: spec2 } = await build(spec1);
    // The link survives — so the shadow keeps the style's five variable bindings.
    // A literal effects write would have DETACHED it (the mock enforces that), and
    // the diff below is what would catch it.
    expect(node.children[2].effectStyleId).toBe('S:shadow2xl,');
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  it('round-trips an override that CLEARS the main\'s shadow (live: 25579:746648)', async () => {
    // The main carries the style…
    await main.children[2].setEffectStyleIdAsync('S:shadow2xl,');
    const inst = main.createInstance();
    // …and the user removed it on this instance. `effects = []` detaches the style,
    // exactly as on the canvas — which is why BOTH fields report as overridden.
    inst.children[2].effects = [];

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['effectStyleId', 'effects']);
    // EMPTY IS THE VALUE. Dropping it — as `fields` drops an empty string — would
    // rebuild the very shadow the user deleted.
    expect(spec1.innerOverrides?.[0]?.visual).toEqual({ effectStyleId: '', effects: [] });

    const { node, spec: spec2 } = await build(spec1);
    expect(node.children[2].effects).toEqual([]);
    expect(node.children[2].effectStyleId).toBe('');
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });

  it('leaves an inner child that overrides NOTHING visual alone — no spurious override', async () => {
    // The P10 trap, in the visual layer: the main's own bound fill and its style must
    // come through createInstance() untouched. A writer that "reapplied" them would
    // report inner overrides the source never had — and kill the bindings doing it.
    await main.children[2].setEffectStyleIdAsync('S:shadow2xl,');

    const spec1 = await scan(main.createInstance());
    expect(spec1.innerOverrides).toBeUndefined();
    expect(spec1.figmaScanInnerOverrides).toBeUndefined();

    const { node, spec: spec2 } = await build(spec1);
    expect(spec2.innerOverrides).toBeUndefined();
    expect(fillAliasOf(node.children[0])).toBe(accent.id); // the main's binding, intact
    expect(node.children[2].effectStyleId).toBe('S:shadow2xl,');
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });
});

describe('spec-005 P15 — the honest degrades', () => {
  it('warns and falls back to literal effects when the style id cannot be resolved', async () => {
    const inst = main.createInstance();
    await inst.children[2].setEffectStyleIdAsync('S:shadow2xl,');
    const spec1 = await scan(inst);

    // The cross-file case: the payload travels, the same-file style id does not.
    setMockEffectStyles([]);
    const { node } = await build(spec1);

    // The shadow still LANDS — as literals, the fallback the scan captured for it —
    // and the loss of the link is reported rather than silently absorbed.
    expect(node.children[2].effects).toHaveLength(1);
    expect(getImportWarnings().join('\n')).toContain('effectStyleId');
  });

  it('warns and writes the literal paint when a bound inner fill\'s key is unresolvable', async () => {
    const brand = makeMockKeyedLocalVariable('tailwind colors/brand', 'KEY-BRAND');
    setMockLocalVariables([accent, brand]);
    const inst = main.createInstance();
    inst.children[0].fills = [solid(0.88, 0, 0.15, brand.id)];
    const spec1 = await scan(inst);

    // The variable is gone by the time the rebuild runs (deleted, or a library the
    // file never subscribed to) — the P8 road ends here.
    setMockLocalVariables([accent]);
    resetKeyedVariableCache();
    const { node } = await build(spec1);

    expect(fillAliasOf(node.children[0])).toBeUndefined();
    // The colour still lands, so the rebuild LOOKS right; the warning is the only
    // thing standing between that and a silent loss.
    expect((node.children[0].fills as Array<{ color: { r: number } }>)[0].color.r).toBeCloseTo(0.88);
    expect(getImportWarnings().join('\n')).toContain('tailwind colors/brand');
  });
});
