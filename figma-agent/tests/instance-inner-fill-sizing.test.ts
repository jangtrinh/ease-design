// spec-005 P14 — the LAST residual of the DS-wide mirror gate: four instances, seven
// diffs each, all one shape (live evidence, scratchpad/p14-evidence-fill-wh.json on
// 25576:542578 "B2 Typing"):
//
//   figmaScanInnerOverrides  [componentProperties,height,name,primaryAxisSizingMode,width]
//                          → [componentProperties,name,primaryAxisSizingMode]
//   innerOverrides[0].fields.height  836  → null
//   innerOverrides[0].fields.width  1108  → null
//
// The child is `Slot / Page content`, FILL/FILL at 1108x836 inside its auto-layout
// parent. The rebuild replays the override with resize() — and Figma silently keeps
// the size auto-layout computed, registering no override (P13's probe; encoded in the
// mock's resize()). The MEASUREMENT is not lost: the live rebuild came out at exactly
// 1108x836, which is why the import raised no "resize did not take" warning. Only
// Figma's "this was SET" bit cannot be written on a FILL child.
//
// So the gate forgives the FLAG and keeps checking the SIZE — and this suite's job is
// to hold that line at both ends: the drop happens ONLY where the walker named the
// refusal, and NEVER where a pixel actually moved.
//
// ONE DELIBERATE USE OF THE MANUAL `overrides =`. The mock derives overrides by
// DIFFERING an instance against its main, while Figma tracks these as "was set" — for
// a FILL child the two part company exactly here, because the value equals what
// auto-layout computes and still carries the flag. That state is the whole subject, so
// it is stated directly, as the mock's own note 11 provides for. Every OTHER assertion
// below rides the derived bookkeeping.
import { describe, it, expect, beforeAll } from 'vitest';
import { installMockFigma, FakeNode } from './helpers/mock-figma.ts';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';
import {
  stripUnreproducibleInnerFields, unreproducibleInnerNotes,
} from '../cli/src/util/mirror-normalize.ts';

beforeAll(() => { installMockFigma(); });

const { nodeToSpec, readMainComponentMap } = await import('../plugin/src/main/scan-node.ts');

const scan = async (node: FakeNode) =>
  nodeToSpec(node as unknown as SceneNode, new Map(), await readMainComponentMap(node as unknown as SceneNode));

/**
 * The live shape: an auto-layout instance holding one child sized by its parent.
 * `sizing` picks the child's axes so a single builder serves the FILL case and its
 * FIXED control.
 */
function instanceWithChild(sizing: 'FILL' | 'FIXED'): { inst: FakeNode; child: FakeNode } {
  const main = new FakeNode('COMPONENT');
  main.name = 'Page/Base';
  main.key = 'KEY-PAGE';
  main.layoutMode = 'VERTICAL';
  main.width = 1440;
  main.height = 900;

  const inst = new FakeNode('INSTANCE');
  inst.name = 'B2 Typing';
  inst.layoutMode = 'VERTICAL';
  inst.width = 1440;
  inst.height = 900;
  inst.mainComponent = { id: main.id, key: main.key as string, name: main.name };

  const child = new FakeNode('INSTANCE');
  // The compound id Figma gives an inner node — the addressing both halves derive
  // their childKey from (instance-inner-override-keys).
  child.id = `I${inst.id};25575:353482`;
  child.name = 'Slot / Page content';
  child.layoutMode = 'VERTICAL';
  inst.appendChild(child);
  child.layoutSizingHorizontal = sizing;
  child.layoutSizingVertical = sizing;
  // The size auto-layout computed. On the FILL run this is ALSO what the override
  // "sets" — the set-but-equal state the whole phase turns on.
  child.width = 1108;
  child.height = 836;
  return { inst, child };
}

describe('spec-005 P14 — a width/height override on a FILL child', () => {
  it('is named by the walker as unreproducible, with the measured size kept', async () => {
    const { inst, child } = instanceWithChild('FILL');
    inst.overrides = [{ id: child.id, overriddenFields: ['height', 'name', 'width'] }];

    const spec = await scan(inst);

    // The honest total still names every field the source overrode…
    expect(spec.figmaScanInnerOverrides).toEqual(['height', 'name', 'width']);
    // …and the walker says which of them Figma will not let a rebuild carry.
    expect(spec.figmaScanUnreproducibleInner).toEqual(['height', 'width']);
    // The geometry the flag is being forgiven FOR — this is what stays comparable.
    expect(spec.innerOverrides?.[0].figmaScanFillSize).toEqual({ width: 1108, height: 836 });
  });

  it('is NOT charged to Figma when the child is FIXED — resize() takes there', async () => {
    const { inst, child } = instanceWithChild('FIXED');
    inst.overrides = [{ id: child.id, overriddenFields: ['height', 'name', 'width'] }];

    const spec = await scan(inst);

    expect(spec.figmaScanInnerOverrides).toEqual(['height', 'name', 'width']);
    expect(spec.figmaScanUnreproducibleInner).toBeUndefined();
    // No FILL axis → no measurement to stand in for a flag, so none is invented.
    expect(spec.innerOverrides?.[0].figmaScanFillSize).toBeUndefined();
  });

  it('keeps `width` accountable when ANY child overriding it is FIXED', async () => {
    // The tally rule: `figmaScanInnerOverrides` unions field NAMES across children, so
    // one reproducible width override anywhere must keep the name in the diff — else
    // a FILL sibling would buy amnesty for a loss that is genuinely ours.
    const { inst, child } = instanceWithChild('FILL');
    const fixed = new FakeNode('FRAME');
    fixed.id = `I${inst.id};25575:999`;
    fixed.name = 'Fixed row';
    inst.appendChild(fixed);
    fixed.layoutSizingHorizontal = 'FIXED';
    fixed.layoutSizingVertical = 'FIXED';
    fixed.width = 320;
    fixed.height = 36;
    inst.overrides = [
      { id: child.id, overriddenFields: ['height', 'width'] },
      { id: fixed.id, overriddenFields: ['width'] },
    ];

    const spec = await scan(inst);

    // height: FILL-only → forgiven. width: also named by a FIXED child → NOT forgiven.
    expect(spec.figmaScanUnreproducibleInner).toEqual(['height']);
  });
});

describe('spec-005 P14 — the mirror normalizer', () => {
  /** The two specs the live gate produced, reduced to the fields under test. */
  const original = (fillSize: { width: number; height: number }) => ({
    type: 'INSTANCE',
    name: 'B2 Typing',
    figmaScanInnerOverrides: ['componentProperties', 'height', 'name', 'primaryAxisSizingMode', 'width'],
    figmaScanUnreproducibleInner: ['height', 'width'],
    innerOverrides: [{
      childKey: '25575:353482',
      fields: { name: 'Slot / Page content', primaryAxisSizingMode: 'FIXED', width: 1108, height: 836 },
      figmaScanFillSize: fillSize,
    }],
  });

  /** What the rebuild honestly reports: no width/height flag for Figma to name. */
  const rebuilt = (fillSize: { width: number; height: number }) => ({
    type: 'INSTANCE',
    name: 'B2 Typing',
    figmaScanInnerOverrides: ['componentProperties', 'name', 'primaryAxisSizingMode'],
    innerOverrides: [{
      childKey: '25575:353482',
      fields: { name: 'Slot / Page content', primaryAxisSizingMode: 'FIXED' },
      figmaScanFillSize: fillSize,
    }],
  });

  const diffNormalized = (a: unknown, b: unknown) =>
    structuralDiff(stripUnreproducibleInnerFields(a), stripUnreproducibleInnerFields(b));

  it('closes the diff when the geometry is identical', () => {
    const size = { width: 1108, height: 836 };
    const { equal, diffs } = diffNormalized(original(size), rebuilt(size));
    expect(diffs).toEqual([]);
    expect(equal).toBe(true);
  });

  it('says out loud what it forgave, and what it still checks', () => {
    const notes = unreproducibleInnerNotes(original({ width: 1108, height: 836 }));
    expect(notes).toHaveLength(2);
    expect(notes.join('\n')).toContain('figmaScanInnerOverrides.height');
    expect(notes.join('\n')).toContain('figmaScanInnerOverrides.width');
    // The reader must never mistake `equal: true` for "the size was forgiven too".
    expect(notes.join('\n')).toContain('figmaScanFillSize');
  });

  it('does NOT forgive a geometry that actually moved — the flag is not a blanket', () => {
    // The rebuild's FILL child came out 136px short: a real lost pixel, and the exact
    // thing a normalizer that dropped width/height on faith would have hidden.
    const { equal, diffs } = diffNormalized(
      original({ width: 1108, height: 836 }),
      rebuilt({ width: 1108, height: 700 }),
    );
    expect(equal).toBe(false);
    expect(diffs).toEqual([
      // Addressed by childKey, not by position — see structural-diff-keyed (P16).
      { path: 'innerOverrides[childKey=25575:353482].figmaScanFillSize.height', left: 836, right: 700 },
    ]);
  });

  it('leaves a height override the walker did NOT name refused failing the gate', () => {
    // No `figmaScanUnreproducibleInner` → the CLI has no field list of its own to fall
    // back on, so a loss we could have carried stays ours. (The P9 rule, one layer in.)
    const a = { ...original({ width: 1108, height: 836 }) } as Record<string, unknown>;
    delete a.figmaScanUnreproducibleInner;
    const { equal, diffs } = diffNormalized(a, rebuilt({ width: 1108, height: 836 }));
    expect(equal).toBe(false);
    expect(diffs.some((d) => d.path.includes('figmaScanInnerOverrides'))).toBe(true);
    expect(diffs.some((d) => d.path === 'innerOverrides[childKey=25575:353482].fields.height')).toBe(true);
  });
});
