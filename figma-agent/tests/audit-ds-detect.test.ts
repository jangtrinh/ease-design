// Pure detect-core tests for the DS-hygiene audit. Fixtures take their SHAPE from the
// real VSF ground truth (component-audit.md) but are hand-written here — the detector
// never needs a live Figma. One `it` per detector, plus sort + summary + pass-through.
import { describe, it, expect } from 'vitest';
import { detectAudit, type AuditReport } from '../cli/src/commands/audit-ds-detect.ts';
import type { AuditComponentFact, AuditDsFacts, AuditUsageFacts } from '../shared/audit-types.ts';

/** One fact with sensible non-triggering defaults (in a numbered section, no unbound paints). */
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
    childTypeSignature: over.childTypeSignature ?? [],
    unboundFills: over.unboundFills ?? 0,
    unboundStrokes: over.unboundStrokes ?? 0,
  };
}

function makeFacts(
  components: AuditComponentFact[],
  usage: Partial<AuditUsageFacts> = {},
  pages: { id: string; name: string }[] = [{ id: 'p1', name: 'Page 1' }],
  skippedPages: string[] = [],
): AuditDsFacts {
  return {
    file: { fileName: 'VSF - PCP', pages, skippedPages },
    components,
    usage: { byMainId: usage.byMainId ?? {}, pagesById: usage.pagesById ?? {}, unresolved: usage.unresolved ?? 0 },
    counts: {
      components: components.filter((c) => c.type === 'COMPONENT').length,
      sets: components.filter((c) => c.type === 'COMPONENT_SET').length,
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
      comp({ id: 'c10b', name: 'Component 10', type: 'COMPONENT_SET', variantCount: 2 }),
      comp({ id: 'frame', name: 'Frame' }),
      comp({ id: 'prop', name: 'CountTab', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { 'Property 1': ['A', 'B', 'C'] } }),
      comp({ id: 'btn', name: 'Button' }),
    ]));
    expect(flagIds(r, 'c10a')).toContain('junk-name');
    expect(flagIds(r, 'c10b')).toContain('junk-name');
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
    const r = detectAudit(makeFacts([
      comp({ id: 'd1', name: 'Data class', type: 'COMPONENT_SET', variantCount: 2, variantAxes: { Size: ['S', 'M'] }, childTypeSignature: ['TEXT'] }),
      comp({ id: 'd2', name: 'Data class', type: 'COMPONENT_SET', variantCount: 2, variantAxes: { Size: ['S', 'M'] }, childTypeSignature: ['TEXT'] }),
    ]));
    expect(flagIds(r, 'd1')).toContain('duplicate-name');
    expect(flagIds(r, 'd2')).toContain('duplicate-name');
    expect(flagIds(r, 'd1')).not.toContain('duplicate-structure');
    expect(flagIds(r, 'd2')).not.toContain('duplicate-structure');
  });

  it('duplicate-structure: same shape + different names (warning); unique shape passes', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 's1', name: 'Alpha', type: 'COMPONENT_SET', variantCount: 2, variantAxes: { State: ['On', 'Off'] }, childTypeSignature: ['FRAME', 'TEXT'] }),
      comp({ id: 's2', name: 'Beta', type: 'COMPONENT_SET', variantCount: 2, variantAxes: { State: ['On', 'Off'] }, childTypeSignature: ['FRAME', 'TEXT'] }),
      comp({ id: 's3', name: 'Gamma', type: 'COMPONENT_SET', variantCount: 2, variantAxes: { State: ['Big', 'Small'] }, childTypeSignature: ['TEXT'] }),
    ]));
    expect(flagIds(r, 's1')).toContain('duplicate-structure');
    expect(flagIds(r, 's2')).toContain('duplicate-structure');
    expect(flagIds(r, 's3')).not.toContain('duplicate-structure');
    expect(flagIds(r, 's1')).not.toContain('duplicate-name');
  });

  it('redundant-family (axis-values): ≥3 shared values across ≥2 names → one family', () => {
    const vals = ['Approved', 'Pending', 'Rejected', 'Superseded'];
    const r = detectAudit(makeFacts([
      comp({ id: 'p1', name: 'Service & API status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Status: vals }, childTypeSignature: ['TEXT'] }),
      comp({ id: 'p2', name: 'Table status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { State: vals }, childTypeSignature: ['FRAME'] }),
      comp({ id: 'p3', name: 'MR status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Kind: vals }, childTypeSignature: ['TEXT', 'TEXT'] }),
    ]));
    const fam = r.families.filter((f) => f.reason === 'axis-values');
    expect(fam).toHaveLength(1);
    expect(fam[0].members).toEqual(['MR status', 'Service & API status', 'Table status']);
    expect(flagIds(r, 'p1')).toContain('redundant-family');
    expect(flagIds(r, 'p3')).toContain('redundant-family');
  });

  it('redundant-family (name-suffix): shared UI-part suffix → one family', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'm1', name: 'BudgetMeter' }),
      comp({ id: 'm2', name: 'QuotaMeter' }),
      comp({ id: 'solo', name: 'HeaderBar' }),
    ]));
    const fam = r.families.filter((f) => f.reason === 'name-suffix');
    expect(fam).toHaveLength(1);
    expect(fam[0].signature).toBe('Meter');
    expect(fam[0].members).toEqual(['BudgetMeter', 'QuotaMeter']);
    expect(flagIds(r, 'm1')).toContain('redundant-family');
    expect(flagIds(r, 'm2')).toContain('redundant-family');
    expect(flagIds(r, 'solo')).not.toContain('redundant-family');
  });

  it('empty-set: COMPONENT_SET with ≤1 variant only (not a lone COMPONENT)', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'e0', name: 'Tier', type: 'COMPONENT_SET', variantCount: 0 }),
      comp({ id: 'e1', name: 'API Spec', type: 'COMPONENT_SET', variantCount: 1, variantAxes: { Variant: ['Variant5'] } }),
      comp({ id: 'full', name: 'SizeSet', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { Size: ['S', 'M', 'L'] } }),
      comp({ id: 'lone', name: 'Icon', type: 'COMPONENT', variantCount: 0 }),
    ]));
    expect(flagIds(r, 'e0')).toContain('empty-set');
    expect(flagIds(r, 'e1')).toContain('empty-set');
    expect(flagIds(r, 'full')).not.toContain('empty-set');
    expect(flagIds(r, 'lone')).not.toContain('empty-set');
  });

  it('unused: missing usage → flag with page count + unresolved hedge; used → count/pages', () => {
    const r = detectAudit(makeFacts(
      [comp({ id: 'used', name: 'UsedThing' }), comp({ id: 'dead', name: 'DeadThing' })],
      { byMainId: { used: 5 }, pagesById: { used: ['Page 1', 'Page 2'] }, unresolved: 3 },
      [{ id: 'p1', name: 'Page 1' }, { id: 'p2', name: 'Page 2' }],
    ));
    const used = r.components.find((c) => c.id === 'used')!;
    const dead = r.components.find((c) => c.id === 'dead')!;
    expect(used.flags.map((f) => f.id)).not.toContain('unused');
    expect(used.usageCount).toBe(5);
    expect(used.usagePages).toEqual(['Page 1', 'Page 2']);
    const deadFlag = dead.flags.find((f) => f.id === 'unused')!;
    expect(deadFlag.detail).toContain('0 instances across 2 scanned pages');
    expect(deadFlag.detail).toContain('3 unresolved');
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

  it('misfiled: null section and non-numbered sections only', () => {
    const r = detectAudit(makeFacts([
      comp({ id: 'null', name: 'Floating', section: null }),
      comp({ id: 'num', name: 'Primitive', section: '01 · Primitives' }),
      comp({ id: 'scratch', name: 'WIP', section: 'Scratch' }),
    ]));
    expect(flagIds(r, 'null')).toContain('misfiled');
    expect(flagIds(r, 'num')).not.toContain('misfiled');
    expect(flagIds(r, 'scratch')).toContain('misfiled');
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

describe('detectAudit — sort, summary, pass-through', () => {
  it('sorts errors ahead of warnings and the summary counts match the fixture', () => {
    const r = detectAudit(makeFacts(
      [
        comp({ id: 'err', name: 'Component 10', type: 'COMPONENT_SET', variantCount: 3, childTypeSignature: ['TEXT'], deprecatedData: true, section: '01 · A' }),
        comp({ id: 'warn', name: 'Lonely', type: 'COMPONENT_SET', variantCount: 1, childTypeSignature: ['FRAME', 'TEXT'], section: '02 · B' }),
      ],
      { byMainId: { err: 2, warn: 1 } }, // both used → no stray unused flags
    ));
    expect(r.components[0].id).toBe('err'); // 2 errors sort ahead of 1 warning
    expect(r.components[1].id).toBe('warn');
    expect(r.summary).toEqual({
      total: 2, unused: 0, junk: 1, deprecated: 1, duplicate: 0,
      emptySets: 1, misfiled: 0, redundantFamilies: 0, tokenViolations: 0,
    });
  });

  it('passes counts through with unresolvedUsage and maps page names', () => {
    const r = detectAudit(makeFacts(
      [comp({ id: 'a', name: 'A', type: 'COMPONENT_SET', variantCount: 2 })],
      { unresolved: 4 },
      [{ id: 'p1', name: 'Page 1' }, { id: 'p2', name: 'Cover' }],
    ));
    expect(r.file.pages).toEqual(['Page 1', 'Cover']);
    expect(r.counts.unresolvedUsage).toBe(4);
    expect(r.counts.sets).toBe(1);
    expect(r.counts.components).toBe(0);
  });
});
