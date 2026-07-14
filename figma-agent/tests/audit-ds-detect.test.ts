// Pure detect-core tests for the DS-hygiene audit (v2). Fixtures take their SHAPE from the
// real VSF ground truth but are hand-written here — the detector never needs a live Figma.
// One `it` per detector, plus segmentation, sort, summary and counts pass-through.
import { describe, it, expect } from 'vitest';
import { detectAudit, type AuditReport } from '../cli/src/commands/audit-ds-detect.ts';
import type { AuditComponentFact, AuditDsFacts, AuditUnitFact, AuditUsageFacts } from '../shared/audit-types.ts';

/** One fact with sensible non-triggering defaults (0×0, no units ⇒ classified `ds`). */
function comp(over: Partial<AuditComponentFact> & { id: string; name: string }): AuditComponentFact {
  return {
    id: over.id,
    key: over.key ?? null,
    name: over.name,
    type: over.type ?? 'COMPONENT',
    variantCount: over.variantCount ?? 0,
    variantAxes: over.variantAxes ?? {},
    pageName: over.pageName ?? 'Page 1',
    section: over.section === undefined ? '01 · Primitives' : over.section,
    deprecatedData: over.deprecatedData ?? false,
    width: over.width ?? 0,
    height: over.height ?? 0,
    unboundFills: over.unboundFills ?? 0,
    unboundStrokes: over.unboundStrokes ?? 0,
    units: over.units ?? [],
  };
}

/** One unit with empty structure/texts/paints defaults (usageCount null unless given). */
function unit(over: Partial<AuditUnitFact> & { id: string; name: string }): AuditUnitFact {
  return {
    id: over.id,
    name: over.name,
    structure: over.structure ?? [],
    texts: over.texts ?? [],
    paints: over.paints ?? [],
    usageCount: over.usageCount ?? null,
  };
}

/** A vector-only unit (no text) — icon material. */
function iconUnit(id: string, name: string): AuditUnitFact {
  return unit({ id, name, structure: [`0:COMPONENT::16x16`, `1:VECTOR:Vector:16x16`] });
}

/** Vector-only masters only count as icons INSIDE a ≥20-strong same-prefix family
 *  (classifyAll) — this pads a fixture's 'Icon /' family up to the threshold. */
function iconFamilyPadding(n: number): AuditComponentFact[] {
  return Array.from({ length: n }, (_, i) =>
    comp({ id: `pad${i}`, name: `Icon / pad-${i}`, units: [iconUnit(`pad${i}u`, `Icon / pad-${i}`)] }));
}

function makeFacts(
  components: AuditComponentFact[],
  usage: Partial<AuditUsageFacts> = {},
  pages: { id: string; name: string }[] = [{ id: 'p1', name: 'Page 1' }],
  skippedPages: string[] = [],
): AuditDsFacts {
  const sets = components.filter((c) => c.type === 'COMPONENT_SET').length;
  return {
    schema: 2,
    file: { fileName: 'VSF - PCP', pages, skippedPages },
    components,
    usage: { byMainId: usage.byMainId ?? {}, pagesById: usage.pagesById ?? {}, unresolved: usage.unresolved ?? 0 },
    counts: {
      masters: components.length,
      sets,
      standalone: components.length - sets,
      variants: components.reduce((s, c) => s + c.variantCount, 0),
      instancesTallied: 0,
    },
  };
}

function flagIds(report: AuditReport, id: string): string[] {
  const c = report.components.find((x) => x.id === id);
  if (!c) throw new Error(`component ${id} not in report`);
  return c.flags.map((f) => f.id);
}

describe('detectAudit — per-detector logic', () => {
  it('junk-name: generic names + all-unnamed axes; real names pass', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'c10a', name: 'Component 10', type: 'COMPONENT_SET', variantCount: 2 }),
      comp({ id: 'frame', name: 'Frame' }),
      comp({ id: 'prop', name: 'CountTab', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { 'Property 1': ['A', 'B', 'C'] } }),
      comp({ id: 'btn', name: 'Button' }),
    ]));
    expect(flagIds(r, 'c10a')).toContain('junk-name');
    expect(flagIds(r, 'frame')).toContain('junk-name');
    expect(flagIds(r, 'prop')).toContain('junk-name'); // axis "Property 1" only → junk
    expect(flagIds(r, 'btn')).not.toContain('junk-name');
  });

  it('deprecated: [deprecated] tag and deprecatedData; clean component passes', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'dep1', name: '[DEPRECATED] CountTab' }),
      comp({ id: 'dep2', name: 'OldThing', deprecatedData: true }),
      comp({ id: 'ok', name: 'Button' }),
    ]));
    expect(flagIds(r, 'dep1')).toContain('deprecated');
    expect(flagIds(r, 'dep2')).toContain('deprecated');
    expect(flagIds(r, 'ok')).not.toContain('deprecated');
  });

  it('duplicate-name flags every match AND suppresses duplicate-structure for them', () => {
    // Both units are comparable (carry text) and identical, but the shared name makes the pair
    // a tombstone/duplicate-name case — structure duplication must NOT double-flag them.
    const dupUnit = (id: string): AuditUnitFact =>
      unit({ id, name: 'Size=S', texts: ['Label'], structure: ['0:COMPONENT::40x20', '1:TEXT:Label:30x12'] });
    const r = detectAudit(makeFacts([
      comp({ id: 'd1', name: 'Data class', type: 'COMPONENT_SET', variantCount: 2, units: [dupUnit('d1u')] }),
      comp({ id: 'd2', name: 'Data class', type: 'COMPONENT_SET', variantCount: 2, units: [dupUnit('d2u')] }),
    ]));
    expect(flagIds(r, 'd1')).toContain('duplicate-name');
    expect(flagIds(r, 'd2')).toContain('duplicate-name');
    expect(flagIds(r, 'd1')).not.toContain('duplicate-structure');
    expect(flagIds(r, 'd2')).not.toContain('duplicate-structure');
  });

  it('unused: hedges (unresolved) + NEW per-variant-usage hedge; used → count/pages', () => {
    const r = detectAudit(makeFacts(
      [
        comp({ id: 'used', name: 'UsedThing' }),
        comp({ id: 'dead', name: 'DeadThing' }),
        comp({
          id: 'ghost', name: 'GhostSet', type: 'COMPONENT_SET', variantCount: 2,
          units: [
            unit({ id: 'g1', name: 'A=1', texts: ['live'], usageCount: 3 }),
            unit({ id: 'g2', name: 'A=2', texts: ['gone'], usageCount: 0 }),
          ],
        }),
      ],
      { byMainId: { used: 5 }, pagesById: { used: ['Page 1', 'Page 2'] }, unresolved: 3 },
      [{ id: 'p1', name: 'Page 1' }, { id: 'p2', name: 'Page 2' }],
    ));
    const used = r.components.find((c) => c.id === 'used')!;
    expect(used.flags.map((f) => f.id)).not.toContain('unused');
    expect(used.usageCount).toBe(5);
    expect(used.usagePages).toEqual(['Page 1', 'Page 2']);

    const deadFlag = r.components.find((c) => c.id === 'dead')!.flags.find((f) => f.id === 'unused')!;
    expect(deadFlag.detail).toContain('0 instances across 2 scanned pages');
    expect(deadFlag.detail).toContain('3 unresolved');

    // census says 0, but the variant getInstancesAsync counts sum to 3 → extra hedge.
    const ghostFlag = r.components.find((c) => c.id === 'ghost')!.flags.find((f) => f.id === 'unused')!;
    expect(ghostFlag.detail).toContain('variants show 3 doc-wide instances');
  });

  it('unused: a skipped (unhydrated) page shrinks the scanned count and adds the lower-bound hedge', () => {
    const r = detectAudit(makeFacts(
      [comp({ id: 'dead', name: 'DeadThing' })],
      {},
      [{ id: 'p1', name: 'Page 1' }, { id: 'p2', name: 'Broken Page' }],
      ['Broken Page'],
    ));
    const deadFlag = r.components[0]!.flags.find((f) => f.id === 'unused')!;
    expect(deadFlag.detail).toContain('0 instances across 1 scanned pages');
    expect(deadFlag.detail).toContain('1 page(s) failed to load — usage is a lower bound');
    expect(r.file.skippedPages).toEqual(['Broken Page']);
  });

  it('empty-set: COMPONENT_SET with ≤1 variant only (not a lone COMPONENT)', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'e0', name: 'Tier', type: 'COMPONENT_SET', variantCount: 0 }),
      comp({ id: 'e1', name: 'API Spec', type: 'COMPONENT_SET', variantCount: 1, variantAxes: { Variant: ['Variant5'] } }),
      comp({ id: 'full', name: 'SizeSet', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { Size: ['S', 'M', 'L'] } }),
      comp({ id: 'lone', name: 'Widget', type: 'COMPONENT', variantCount: 0 }),
    ]));
    expect(flagIds(r, 'e0')).toContain('empty-set');
    expect(flagIds(r, 'e1')).toContain('empty-set');
    expect(flagIds(r, 'full')).not.toContain('empty-set');
    expect(flagIds(r, 'lone')).not.toContain('empty-set');
  });

  it('misfiled: fires ONLY when a section taxonomy is configured', () => {
    const comps = [
      comp({ id: 'floating', name: 'Floating', section: null }),
      comp({ id: 'member', name: 'Primitive', section: '01 · Primitives' }),
      comp({ id: 'scratch', name: 'WIP', section: 'Scratch' }),
    ];
    // No opts → zero misfiled even with a null section and an odd one.
    const r0 = detectAudit(makeFacts(comps));
    expect(flagIds(r0, 'floating')).not.toContain('misfiled');
    expect(flagIds(r0, 'scratch')).not.toContain('misfiled');
    expect(r0.summary.misfiled).toBe(0);
    // Configured taxonomy → null + non-member flagged, member clean.
    const r1 = detectAudit(makeFacts(comps), { sections: ['01 · Primitives'] });
    expect(flagIds(r1, 'floating')).toContain('misfiled');
    expect(flagIds(r1, 'scratch')).toContain('misfiled');
    expect(flagIds(r1, 'member')).not.toContain('misfiled');
  });

  it('token-violation: unbound paints → warning with a count in the detail', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'unbound', name: 'RawFill', unboundFills: 2 }),
      comp({ id: 'clean', name: 'Tokenized' }),
    ]));
    const flag = r.components.find((c) => c.id === 'unbound')!.flags.find((f) => f.id === 'token-violation')!;
    expect(flag.severity).toBe('warning');
    expect(flag.detail).toContain('2 fills');
    expect(flagIds(r, 'clean')).not.toContain('token-violation');
  });
});

describe('detectAudit — segmentation, sort, summary, counts', () => {
  it('segments icons and screens OUT of components[] + summary; segment stats are correct', () => {
    const r = detectAudit(makeFacts(
      [
        comp({ id: 'ds', name: 'Button', type: 'COMPONENT_SET', variantCount: 2, units: [unit({ id: 'b', name: 'Size=S', texts: ['Go'] })] }),
        comp({ id: 'ic1', name: 'Icon / star', units: [iconUnit('ic1u', 'Icon / star')] }),
        comp({ id: 'ic2', name: 'Icon / heart', units: [iconUnit('ic2u', 'Icon / heart')] }),
        ...iconFamilyPadding(18), // brings the 'Icon /' family to the ≥20 icon threshold
        comp({ id: 'scr1', name: 'Home Screen', width: 1440, height: 1024 }),
        comp({ id: 'scr2', name: 'Big Board', section: '01 · A', width: 1200, height: 800 }),
      ],
      { byMainId: { ds: 1, ic2: 4 } }, // ic2 used, ic1 + padding unused
    ));
    const ids = r.components.map((c) => c.id);
    expect(ids).toEqual(['ds']); // ONLY the ds master survives into components[]
    expect(r.summary.total).toBe(1);
    expect(r.segments.icons.total).toBe(20);
    expect(r.segments.icons.used).toBe(1);
    expect(r.segments.icons.unused).toBe(19);
    expect(r.segments.icons.unusedNames).toContain('Icon / star');
    expect(r.segments.icons.unusedNames).not.toContain('Icon / heart');
    expect(r.segments.screens).toEqual({ total: 2, names: ['Big Board', 'Home Screen'] });
    expect(r.components[0].kind).toBe('ds');
  });

  it('parses variant axisValues CLI-side and reports usageCount per variant', () => {
    const r = detectAudit(makeFacts(
      [comp({
        id: 'set', name: 'Chip', type: 'COMPONENT_SET', variantCount: 2,
        units: [unit({ id: 'v1', name: 'Tone=ok, Size=S', texts: ['x'], usageCount: 7 }), unit({ id: 'v2', name: 'Tone=bad, Size=L', texts: ['y'], usageCount: 0 })],
      })],
      { byMainId: { set: 7 } },
    ));
    const set = r.components.find((c) => c.id === 'set')!;
    expect(set.variants).toEqual([
      { id: 'v1', name: 'Tone=ok, Size=S', axisValues: { Tone: 'ok', Size: 'S' }, usageCount: 7 },
      { id: 'v2', name: 'Tone=bad, Size=L', axisValues: { Tone: 'bad', Size: 'L' }, usageCount: 0 },
    ]);
  });

  it('sorts errors ahead of warnings and the summary carries all 11 keys', () => {
    const r = detectAudit(makeFacts(
      [
        comp({ id: 'err', name: 'Component 10', type: 'COMPONENT_SET', variantCount: 3, deprecatedData: true, section: '01 · A' }),
        comp({ id: 'warn', name: 'Lonely', type: 'COMPONENT_SET', variantCount: 1, section: '02 · B' }),
      ],
      { byMainId: { err: 2, warn: 1 } }, // both used → no stray unused flags
    ));
    expect(r.components[0].id).toBe('err'); // 2 errors sort ahead of 1 warning
    expect(r.components[1].id).toBe('warn');
    expect(r.summary).toEqual({
      total: 2, unused: 0, junk: 1, deprecated: 1, duplicateName: 0, duplicateStructure: 0,
      deadVariants: 0, emptySets: 1, misfiled: 0, redundantFamilies: 0, tokenViolations: 0,
    });
  });

  it('passes counts through (masters/sets/standalone/variants/instancesTallied) + icons/screens/unresolved', () => {
    const r = detectAudit(makeFacts(
      [
        comp({ id: 'a', name: 'A', type: 'COMPONENT_SET', variantCount: 2, units: [unit({ id: 'au', name: 'X=1', texts: ['t'] })] }),
        comp({ id: 'ic', name: 'Icon / x', units: [iconUnit('icu', 'Icon / x')] }),
        ...iconFamilyPadding(19), // 'Icon /' family reaches the ≥20 icon threshold
        comp({ id: 'sc', name: 'Screen 1', width: 1440, height: 1024 }),
      ],
      { unresolved: 4 },
      [{ id: 'p1', name: 'Page 1' }, { id: 'p2', name: 'Cover' }],
    ));
    expect(r.file.pages).toEqual(['Page 1', 'Cover']);
    expect(r.counts).toEqual({
      masters: 22, sets: 1, standalone: 21, icons: 20, screens: 1, variants: 2, instancesTallied: 0, unresolvedUsage: 4,
    });
  });
});
