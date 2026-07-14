// Pure tests for the structural analysis layer: kind classification, unit comparability,
// within-set / cross-master duplicate grouping, and dead variants. Hand-written units mirror
// the shape the plugin emits (nameless root entry, `${depth}:${type}:${name}:${w}x${h}`).
import { describe, it, expect } from 'vitest';
import {
  classifyAll, comparable, detectStructure, type CrossMasterGroup,
} from '../cli/src/commands/audit-ds-structure.ts';
import type { AuditComponentFact, AuditUnitFact } from '../shared/audit-types.ts';

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

/** A text-bearing (comparable) unit — the common building block for duplicate tests. */
function textUnit(id: string, name: string): AuditUnitFact {
  return unit({ id, name, texts: ['Label'], structure: ['0:COMPONENT::40x20', '1:TEXT:Label:30x12'] });
}

/** A vector-only (icon-candidate) master named `name`. */
function vectorMaster(id: string, name: string): ReturnType<typeof comp> {
  return comp({ id, name, units: [unit({ id: `${id}u`, name, structure: ['0:COMPONENT::16x16', '1:VECTOR:Vector:16x16'] })] });
}

describe('classifyAll', () => {
  it('icon = vector-only INSIDE a big same-prefix family; screen = viewport size; ds otherwise', () => {
    // A bulk-imported icon library: 20 same-prefix vector-only masters (MIN_ICON_FAMILY).
    const library = Array.from({ length: 20 }, (_, i) => vectorMaster(`ic${i}`, `Icon / glyph-${i}`));
    // A SET of vector-only variants under the same prefix joins the family too.
    const iconSet = comp({
      id: 'is', name: 'Icon / Arrows', type: 'COMPONENT_SET', variantCount: 2,
      units: [
        unit({ id: 'a', name: 'N=1', structure: ['0:COMPONENT::16x16', '1:VECTOR:Vector:16x16'] }),
        unit({ id: 'b', name: 'N=2', structure: ['0:COMPONENT::16x16', '1:ELLIPSE:Ellipse:16x16'] }),
      ],
    });
    const masters = [
      ...library,
      iconSet,
      // LONE vector-only primitives (live VSF finding: Separator/Switch/StatusDot/Logo are
      // text-free BY DESIGN) — no big family ⇒ ds, they keep their detector coverage.
      vectorMaster('sep', 'Separator'),
      vectorMaster('star', 'user-star'),
      // viewport size → screen
      comp({ id: 's2', name: 'Board', width: 1200, height: 800 }),
      // a section literally named 'Screen' does NOT make a screen — on the real VSF file that
      // section held true DS masters (Component 208 uses, Table status 151); size is the signal.
      comp({ id: 's1', name: 'Table status', section: 'Screen', units: [textUnit('su', 'Home')] }),
      // text-bearing → ds
      comp({ id: 'd', name: 'Button', units: [textUnit('du', 'Button')] }),
      // no units at all → ds (never the vacuous "icon")
      comp({ id: 'x', name: 'Empty' }),
    ];
    const kinds = classifyAll(masters);
    expect(kinds.get('ic0')).toBe('icon');
    expect(kinds.get('ic19')).toBe('icon');
    expect(kinds.get('is')).toBe('icon');
    expect(kinds.get('sep')).toBe('ds');
    expect(kinds.get('star')).toBe('ds');
    expect(kinds.get('s2')).toBe('screen');
    expect(kinds.get('s1')).toBe('ds');
    expect(kinds.get('d')).toBe('ds');
    expect(kinds.get('x')).toBe('ds');
  });
});

describe('comparable', () => {
  it('text / instance / custom-name qualify; a bare default-named vector does not', () => {
    expect(comparable(unit({ id: 'v', name: 'x', structure: ['0:COMPONENT::16x16', '1:VECTOR:Vector:16x16'] }))).toBe(false);
    expect(comparable(unit({ id: 't', name: 'x', texts: ['hi'], structure: ['0:COMPONENT::40x20', '1:TEXT:Label:30x12'] }))).toBe(true);
    expect(comparable(unit({ id: 'in', name: 'x', structure: ['0:COMPONENT::40x40', '1:INSTANCE:Icon:16x16'] }))).toBe(true);
    expect(comparable(unit({ id: 'c', name: 'x', structure: ['0:COMPONENT::40x40', '1:FRAME:Avatar:24x24'] }))).toBe(true);
  });
});

describe('detectStructure', () => {
  it('within-set: identical variants → ONE flag on the master, both unit names in the detail', () => {
    const set = comp({ id: 'set', name: 'Chip', type: 'COMPONENT_SET', variantCount: 2, units: [textUnit('a', 'Tone=ok'), textUnit('b', 'Tone=bad')] });
    const dup = (detectStructure([set], {}).flagsById.get('set') ?? []).filter((f) => f.id === 'duplicate-structure');
    expect(dup).toHaveLength(1);
    expect(dup[0].detail).toContain('Tone=ok');
    expect(dup[0].detail).toContain('Tone=bad');
  });

  it('sibling variants differing only in text OR only in paint are NOT structural duplicates', () => {
    const textSet = comp({
      id: 't', name: 'Tabs', type: 'COMPONENT_SET', variantCount: 2,
      units: [
        unit({ id: 'ta', name: 'V=1', texts: ['One'], structure: ['0:COMPONENT::40x20', '1:TEXT:Label:30x12'] }),
        unit({ id: 'tb', name: 'V=2', texts: ['Two'], structure: ['0:COMPONENT::40x20', '1:TEXT:Label:30x12'] }),
      ],
    });
    expect((detectStructure([textSet], {}).flagsById.get('t') ?? []).filter((f) => f.id === 'duplicate-structure')).toHaveLength(0);

    const paintSet = comp({
      id: 'p', name: 'Dot', type: 'COMPONENT_SET', variantCount: 2,
      units: [
        unit({ id: 'pa', name: 'Tone=ok', texts: ['x'], paints: ['f:#00ff00'], structure: ['0:COMPONENT::16x16', '1:TEXT:Label:10x10'] }),
        unit({ id: 'pb', name: 'Tone=bad', texts: ['x'], paints: ['f:#ff0000'], structure: ['0:COMPONENT::16x16', '1:TEXT:Label:10x10'] }),
      ],
    });
    expect((detectStructure([paintSet], {}).flagsById.get('p') ?? []).filter((f) => f.id === 'duplicate-structure')).toHaveLength(0);
  });

  it('cross-master: matching units flag each master once (naming the other) + surface in crossMasterGroups', () => {
    const a = comp({ id: 'A', name: 'Service status', type: 'COMPONENT_SET', variantCount: 1, units: [textUnit('a1', 'S=ok')] });
    const b = comp({ id: 'B', name: 'Table status', type: 'COMPONENT_SET', variantCount: 1, units: [textUnit('b1', 'S=ok')] });
    const { flagsById, crossMasterGroups } = detectStructure([a, b], {});
    const af = (flagsById.get('A') ?? []).filter((f) => f.id === 'duplicate-structure');
    const bf = (flagsById.get('B') ?? []).filter((f) => f.id === 'duplicate-structure');
    expect(af).toHaveLength(1);
    expect(bf).toHaveLength(1);
    expect(af[0].detail).toContain('Table status'); // names the OTHER master
    expect(bf[0].detail).toContain('Service status');
    expect(crossMasterGroups).toHaveLength(1);
    expect(crossMasterGroups[0].masters).toEqual(['Service status', 'Table status']);
  });

  it('standalone ↔ variant structural match flags both masters', () => {
    const lone = comp({ id: 'L', name: 'Greeting', type: 'COMPONENT', units: [textUnit('l1', 'Greeting')] });
    const set = comp({ id: 'S', name: 'Salute', type: 'COMPONENT_SET', variantCount: 1, units: [textUnit('s1', 'V=1')] });
    const { flagsById } = detectStructure([lone, set], {});
    expect((flagsById.get('L') ?? []).some((f) => f.id === 'duplicate-structure')).toBe(true);
    expect((flagsById.get('S') ?? []).some((f) => f.id === 'duplicate-structure')).toBe(true);
  });

  it('root-name independence: identical content under different variant labels still hash-matches', () => {
    // unitHash covers structure/texts/paints only — the variant label (unit.name) is excluded,
    // and the plugin emits a nameless root entry, so top-level names never enter the hash.
    const a = comp({ id: 'A', name: 'Alpha', type: 'COMPONENT_SET', variantCount: 1, units: [textUnit('a1', 'Left')] });
    const b = comp({ id: 'B', name: 'Beta', type: 'COMPONENT_SET', variantCount: 1, units: [textUnit('b1', 'Right')] });
    expect(detectStructure([a, b], {}).crossMasterGroups).toHaveLength(1);
  });

  it('tombstone pair (X vs ❌ X) with identical units → NO duplicate-structure (normalized skip)', () => {
    const mk = (id: string): AuditUnitFact => unit({ id, name: 'V=1', texts: ['Data'], structure: ['0:COMPONENT::80x24', '1:TEXT:Label:60x16'] });
    const live = comp({ id: 'live', name: 'Data class', type: 'COMPONENT_SET', variantCount: 1, units: [mk('lv')] });
    const dead = comp({ id: 'dead', name: '❌ Data class', type: 'COMPONENT_SET', variantCount: 1, units: [mk('dv')] });
    const { flagsById, crossMasterGroups } = detectStructure([live, dead], {});
    expect((flagsById.get('live') ?? []).some((f) => f.id === 'duplicate-structure')).toBe(false);
    expect((flagsById.get('dead') ?? []).some((f) => f.id === 'duplicate-structure')).toBe(false);
    expect(crossMasterGroups).toHaveLength(0);
  });

  it('dead-variants: used set flags only 0-usage variants (count 1); unused set + standalone never', () => {
    const usedSet = comp({
      id: 'U', name: 'Btn', type: 'COMPONENT_SET', variantCount: 3,
      units: [
        unit({ id: 'u1', name: 'S=live', usageCount: 5 }),
        unit({ id: 'u2', name: 'S=dead', usageCount: 0 }),
        unit({ id: 'u3', name: 'S=unknown', usageCount: null }),
      ],
    });
    const { flagsById, deadCountById } = detectStructure([usedSet], { U: 5 });
    const dead = (flagsById.get('U') ?? []).find((f) => f.id === 'dead-variants')!;
    expect(dead).toBeDefined();
    expect(dead.detail).toContain('S=dead');
    expect(dead.detail).not.toContain('S=unknown'); // null usage = unknown, never counted dead
    expect(deadCountById.get('U')).toBe(1);

    // an UNUSED set (census 0) → the set's own "unused" flag is the story, no dead-variants.
    const unusedSet = comp({ id: 'X', name: 'Ghost', type: 'COMPONENT_SET', variantCount: 1, units: [unit({ id: 'x1', name: 'V=1', usageCount: 0 })] });
    expect((detectStructure([unusedSet], {}).flagsById.get('X') ?? []).some((f) => f.id === 'dead-variants')).toBe(false);

    // a standalone COMPONENT → never dead-variants (no variant axis to prune).
    const lone = comp({ id: 'L', name: 'Solo', type: 'COMPONENT', units: [unit({ id: 'l1', name: 'Solo', usageCount: 0 })] });
    expect((detectStructure([lone], { L: 3 }).flagsById.get('L') ?? []).some((f) => f.id === 'dead-variants')).toBe(false);
  });

  it('CrossMasterGroup is exported and typed as expected', () => {
    const g: CrossMasterGroup = { hash: 'abc', masters: ['A', 'B'], texts: [] };
    expect(g.masters).toHaveLength(2);
  });
});
