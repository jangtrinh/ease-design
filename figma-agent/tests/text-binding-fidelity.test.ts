// spec-005 P9 — the OFFLINE proof for the four TEXT diffs the P5 live run left on
// the footer node 25575:354192 ("© 2025 shadcndesign.com").
//
// Both causes were found by PROBING THE LIVE CANVAS, and both contradicted the
// first guess (that the rebuild bound fonts before loading them):
//
//   fontFamily / fontWeight — NOT a bind failure at all. `setBoundVariable` accepts
//     both on a TEXT node with no font loaded first; the rebuild had them right all
//     along. The SCAN was wrong: `node.fontName` returns figma.mixed on style-linked
//     text even when all 23 characters share one font, so the walker emitted no
//     fontFamily and no fontWeight for the ORIGINAL and the mirror blamed the
//     rebuild for reporting the truth. getStyledTextSegments is the honest read.
//
//   maxWidth — the reverse: an honest scan of a binding NO rebuild can replay.
//     `setBoundVariable('maxWidth', v)` throws on a TEXT node ("invalid field for
//     text node") while binding fine on a FRAME, yet Figma's own UI authored that
//     binding on the original. So it is recorded (`figmaScanUnbindable`) and the
//     mirror charges it to Figma, out loud, instead of failing forever.
//
// The mock encodes BOTH refusals (mock-figma notes 9 + 10) — a permissive mock is
// exactly what let these survive a green suite until the first live round-trip.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockLocalVariables, setMockLibraryVariables,
  setMockVariableCollections, makeMockKeyedLocalVariable, FakeNode,
} from './helpers/mock-figma.ts';
import { stripUnbindableBindings, unbindableNotes } from '../cli/src/util/mirror-normalize.ts';
import type { FigmaExportNode, FigmaExportTokens } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec, readTokenNameMap, readKeyedVariableMap } = await import('../plugin/src/main/scan-node.ts');
const { resolveTokenVars } = await import('../plugin/src/main/executor-token-var-resolve.ts');
const { resetKeyedVariableCache } = await import('../plugin/src/main/executor-keyed-vars.ts');
const { getImportWarnings, resetImportWarnings } = await import('../plugin/src/main/executor-styles.ts');

const NO_TOKENS: FigmaExportTokens = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };
const BE_VIETNAM: FontName = { family: 'Be Vietnam Pro', style: 'Regular' };

const aliasOf = (bound: unknown): string | undefined => (bound as { id?: string } | undefined)?.id;

async function scan(node: FakeNode): Promise<Record<string, unknown>> {
  const scene = node as unknown as SceneNode;
  const tokenNames = await readTokenNameMap();
  const keyedVars = await readKeyedVariableMap(scene);
  return nodeToSpec(scene, tokenNames, undefined, keyedVars) as unknown as Record<string, unknown>;
}

async function rebuildFromSpecAlone(spec: FigmaExportNode): Promise<Record<string, unknown>> {
  const tokenVars = await resolveTokenVars(NO_TOKENS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), tokenVars as any);
  if (!node) throw new Error('builder returned null');
  return node as unknown as Record<string, unknown>;
}

/** The live footer in miniature: one uniform font, a node-level getter that refuses
 * to say so, and the five bindings the real node carries. */
function footerText(bindings: Record<string, string>): FakeNode {
  const text = new FakeNode('TEXT');
  text.name = '© 2025 shadcndesign.com';
  text.characters = '© 2025 shadcndesign.com';
  text.fontSize = 18;
  text.setMixedFontNameGetter(BE_VIETNAM);
  text.boundVariables = Object.fromEntries(
    Object.entries(bindings).map(([field, id]) => [field, { type: 'VARIABLE_ALIAS', id }]),
  );
  return text;
}

beforeEach(() => {
  resetImportWarnings();
  resetKeyedVariableCache();
  setMockLocalVariables([]);
  setMockLibraryVariables([]);
  setMockVariableCollections([]);
});

describe('scan — a font the node-level getter calls mixed is read from its ONE segment', () => {
  it('recovers fontFamily + fontWeight from the single styled segment', async () => {
    const spec = await scan(footerText({}));

    expect(spec.fontFamily).toBe('Be Vietnam Pro');
    expect(spec.fontWeight).toBe(400);
  });

  it('leaves both unset when the text is GENUINELY mixed (two runs, no one truth)', async () => {
    const text = new FakeNode('TEXT');
    text.name = 'Mixed';
    text.characters = 'Hello world';
    text.setStyledTextSegments([
      { start: 0, end: 5, characters: 'Hello', fontName: { family: 'Inter', style: 'Bold' } },
      { start: 5, end: 11, characters: ' world', fontName: BE_VIETNAM },
    ]);

    const spec = await scan(text);

    expect(spec.fontFamily).toBeUndefined();
    expect(spec.fontWeight).toBeUndefined();
  });

  it('still prefers the node-level getter when it answers (regression)', async () => {
    const text = new FakeNode('TEXT');
    text.name = 'Title';
    text.characters = 'Hello';
    text.fontName = { family: 'Inter', style: 'Bold' };

    const spec = await scan(text);

    expect(spec.fontFamily).toBe('Inter');
    expect(spec.fontWeight).toBe(700);
  });
});

describe('round-trip — the font bindings survive as BINDINGS, not literals', () => {
  it('reattaches fontFamily + fontWeight by key, with no literal fallback left behind', async () => {
    const family = makeMockKeyedLocalVariable('font/font-sans', 'KFAM', 'STRING');
    const weight = makeMockKeyedLocalVariable('font-weight/normal', 'KWGT', 'FLOAT');
    setMockLocalVariables([family, weight]);

    const spec = await scan(footerText({ fontFamily: family.id, fontWeight: weight.id }));

    // The scan addresses both by publish key — no tokenRefs slot exists for either.
    expect(spec.keyedBindings).toEqual({
      fontFamily: { key: 'KFAM', name: 'font/font-sans' },
      fontWeight: { key: 'KWGT', name: 'font-weight/normal' },
    });

    const rebuilt = await rebuildFromSpecAlone(spec as FigmaExportNode);
    const bound = rebuilt.boundVariables as Record<string, unknown>;

    expect(aliasOf(bound.fontFamily)).toBe(family.id);
    expect(aliasOf(bound.fontWeight)).toBe(weight.id);
    expect(getImportWarnings()).toEqual([]);
  });

  it('lands on a FIXED POINT: the rescanned rebuild reports the same font', async () => {
    const family = makeMockKeyedLocalVariable('font/font-sans', 'KFAM', 'STRING');
    setMockLocalVariables([family]);

    const specA = await scan(footerText({ fontFamily: family.id }));
    const rebuilt = await rebuildFromSpecAlone(specA as FigmaExportNode);
    const specB = await scan(rebuilt as unknown as FakeNode);

    // Pinned, not just equal: two undefineds would satisfy a bare toBe(specA.x)
    // and assert nothing — the exact diff P5 reported was undefined → "Be Vietnam Pro".
    expect(specA.fontFamily).toBe('Be Vietnam Pro');
    expect(specB.fontFamily).toBe(specA.fontFamily);
    expect(specA.fontWeight).toBe(400);
    expect(specB.fontWeight).toBe(specA.fontWeight);
  });
});

describe('scan — a binding Figma REFUSES on this node type is recorded, not offered', () => {
  it('keeps maxWidth out of a TEXT node keyedBindings and names the refusal', async () => {
    const maxW = makeMockKeyedLocalVariable('max-width/max-w-xl', 'KMAX', 'FLOAT');
    setMockLocalVariables([maxW]);

    const spec = await scan(footerText({ maxWidth: maxW.id }));

    expect(spec.keyedBindings).toBeUndefined();
    expect(spec.figmaScanUnbindable).toEqual(['maxWidth']);
    // The raw id NEVER disappears — the record of what was seen does not shrink.
    expect(spec.figmaScanBindings).toEqual({ maxWidth: maxW.id });
  });

  it('still carries maxWidth by key on a FRAME, where Figma accepts it (regression)', async () => {
    const maxW = makeMockKeyedLocalVariable('max-width/max-w-xl', 'KMAX', 'FLOAT');
    setMockLocalVariables([maxW]);

    const frame = new FakeNode('FRAME');
    frame.name = 'Wrapper';
    frame.width = 576;
    frame.height = 40;
    frame.boundVariables = { maxWidth: { type: 'VARIABLE_ALIAS', id: maxW.id } };

    const spec = await scan(frame);

    expect(spec.keyedBindings).toEqual({ maxWidth: { key: 'KMAX', name: 'max-width/max-w-xl' } });
    expect(spec.figmaScanUnbindable).toBeUndefined();

    const rebuilt = await rebuildFromSpecAlone(spec as FigmaExportNode);
    expect(aliasOf((rebuilt.boundVariables as Record<string, unknown>).maxWidth)).toBe(maxW.id);
    expect(getImportWarnings()).toEqual([]);
  });

  it('rebuilds the TEXT node without ever attempting the bind Figma would throw on', async () => {
    const maxW = makeMockKeyedLocalVariable('max-width/max-w-xl', 'KMAX', 'FLOAT');
    setMockLocalVariables([maxW]);

    const spec = await scan(footerText({ maxWidth: maxW.id }));
    await rebuildFromSpecAlone(spec as FigmaExportNode);

    // P5 live emitted exactly one such warning, per node, forever.
    expect(getImportWarnings()).toEqual([]);
  });
});

describe('mirror normalize — the refusal closes the diff WITHOUT hiding it', () => {
  const original = {
    type: 'TEXT',
    name: 'Footer',
    figmaScanBindings: { maxWidth: 'VariableID:1:65', fontSize: 'VariableID:22:13' },
    figmaScanUnbindable: ['maxWidth'],
  };
  const rebuilt = {
    type: 'TEXT',
    name: 'Footer',
    figmaScanBindings: { fontSize: 'VariableID:22:13' },
  };

  it('drops the refused binding from both sides, keeping every other one', () => {
    expect(stripUnbindableBindings(original)).toEqual({
      type: 'TEXT', name: 'Footer', figmaScanBindings: { fontSize: 'VariableID:22:13' },
    });
    expect(stripUnbindableBindings(rebuilt)).toEqual(rebuilt);
  });

  it('removes figmaScanBindings entirely when the refusal was its only entry', () => {
    expect(stripUnbindableBindings({
      type: 'TEXT', name: 'Footer',
      figmaScanBindings: { maxWidth: 'VariableID:1:65' },
      figmaScanUnbindable: ['maxWidth'],
    })).toEqual({ type: 'TEXT', name: 'Footer' });
  });

  it('reaches nested children and does not mutate the input', () => {
    const tree = { type: 'FRAME', name: 'Shell', children: [original] };
    const out = stripUnbindableBindings(tree) as { children: Array<Record<string, unknown>> };

    expect(out.children[0].figmaScanUnbindable).toBeUndefined();
    expect(tree.children[0].figmaScanUnbindable).toEqual(['maxWidth']);
  });

  it('reports every dropped field by path, so `equal: true` is never silent', () => {
    const notes = unbindableNotes({ type: 'FRAME', name: 'Shell', children: [original] });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('children[0].figmaScanBindings.maxWidth');
    expect(notes[0]).toContain('TEXT');
  });

  it('drops NOTHING when the walker named no refusal (the CLI holds no field list)', () => {
    const spec = { type: 'TEXT', name: 'Footer', figmaScanBindings: { maxWidth: 'VariableID:1:65' } };

    expect(stripUnbindableBindings(spec)).toEqual(spec);
    expect(unbindableNotes(spec)).toEqual([]);
  });
});
