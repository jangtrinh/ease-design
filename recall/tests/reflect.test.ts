// cmd-reflect.ts is only partially pure: parseJobEvents, buildWriteBack and
// formatReflect never touch the embedding model or the filesystem, so they are
// tested here directly. runReflect (which loads the embedding model) is NOT
// exercised — see the Track 9 P4 integration coverage for that.
import { describe, it, expect } from 'vitest';
import {
  parseJobEvents,
  buildWriteBack,
  formatReflect,
} from '../cli/src/cmd-reflect.ts';
import type { ReflectPacket, ReflectNeighbor } from '../cli/src/cmd-reflect.ts';

describe('parseJobEvents', () => {
  it('accepts a bare id array, preserving order', () => {
    expect(parseJobEvents(['e1', 'e2'])).toEqual(['e1', 'e2']);
  });

  it('accepts { events: [...] }', () => {
    expect(parseJobEvents({ events: ['e1'] })).toEqual(['e1']);
  });

  it('extracts ids from an array of { id } objects', () => {
    expect(parseJobEvents([{ id: 'e1' }, { id: 'e2' }])).toEqual(['e1', 'e2']);
  });

  it('accepts a mix of bare strings and { id } objects', () => {
    expect(parseJobEvents(['e1', { id: 'e2' }, 'e3'])).toEqual(['e1', 'e2', 'e3']);
  });

  it.each([42, null, {}, { events: 'x' }])(
    'throws on a non-array, non-{events:[]} value: %j',
    (raw) => {
      expect(() => parseJobEvents(raw)).toThrow(/JSON array of event ids|"events"/);
    },
  );

  it.each([[1], [{}], [null]])(
    'throws on an entry that is neither a string nor {id: string}: %j',
    (raw) => {
      expect(() => parseJobEvents(raw)).toThrow(/event ids|"id" field/);
    },
  );

  it('throws on an empty bare array with a message about no event ids', () => {
    expect(() => parseJobEvents([])).toThrow(/no event ids/);
  });

  it('throws on { events: [] } with a message about no event ids', () => {
    expect(() => parseJobEvents({ events: [] })).toThrow(/no event ids/);
  });
});

describe('buildWriteBack', () => {
  it('contains the ui memory record insight command', () => {
    expect(buildWriteBack(['e1'], '/proj')).toContain('ui memory record insight');
  });

  it('comma-joins refs with no spaces', () => {
    const out = buildWriteBack(['e3', 'e4'], '/proj');
    expect(out).toContain('--refs e3,e4');
    expect(out).not.toContain('e3, e4');
  });

  it('includes --dir <projectDir> verbatim', () => {
    expect(buildWriteBack(['e1'], '/some/project/dir')).toContain('--dir /some/project/dir');
  });

  it('contains the placeholder for the durable lesson', () => {
    expect(buildWriteBack(['e1'], '/proj')).toContain('<THE ONE DURABLE LESSON>');
  });

  it('handles a single id', () => {
    const out = buildWriteBack(['e1'], '/proj');
    expect(out).toContain('--refs e1');
    expect(out).toContain('--dir /proj');
  });
});

// Helper to build a minimal ReflectPacket, overridable per test.
function packet(overrides: Partial<ReflectPacket> = {}): ReflectPacket {
  return {
    jobEventIds: ['e1'],
    jobItems: [{ id: 'e1', tier: 'episodic', text: 'did a thing', t: '2026-07-10T00:00:00.000Z' }],
    missing: [],
    neighbors: [],
    instruction: 'Extract exactly ONE durable lesson.',
    writeBack: "ui memory record insight --data '{}' --refs e1 --dir /proj",
    ...overrides,
  };
}

function neighbor(overrides: Partial<ReflectNeighbor> = {}): ReflectNeighbor {
  return {
    id: 'n1',
    score: 0.9,
    superseded: false,
    tier: 'semantic',
    source: 'insight',
    text: 'memory says something relevant',
    ...overrides,
  };
}

describe('formatReflect', () => {
  it('starts with [REFLECT PACKET]', () => {
    expect(formatReflect(packet())).toMatch(/^\[REFLECT PACKET\]/);
  });

  it('warns and names missing ids, telling the reader to run recall index first', () => {
    const out = formatReflect(packet({ missing: ['e9', 'e10'] }));
    expect(out).toContain('e9, e10');
    expect(out).toMatch(/not indexed/);
    expect(out).toMatch(/recall index/);
  });

  it('omits the missing warning when missing is empty', () => {
    const out = formatReflect(packet({ missing: [] }));
    expect(out).not.toMatch(/not indexed/);
  });

  it('renders each job item with [id], tier and text', () => {
    const out = formatReflect(
      packet({ jobItems: [{ id: 'e1', tier: 'episodic', text: 'did a thing', t: '2026-07-10' }] }),
    );
    expect(out).toContain('[e1]');
    expect(out).toContain('(episodic)');
    expect(out).toContain('did a thing');
  });

  it('renders a (none indexed) line when jobItems is empty', () => {
    const out = formatReflect(packet({ jobItems: [] }));
    expect(out).toContain('(none indexed)');
  });

  it('renders neighbors with [id] and a source/tier flag string', () => {
    const out = formatReflect(packet({ neighbors: [neighbor({ id: 'n1', source: 'insight', tier: 'semantic' })] }));
    expect(out).toContain('[n1]');
    expect(out).toContain('insight/semantic');
  });

  it('shows "superseded" in the flags for a superseded neighbor', () => {
    const out = formatReflect(packet({ neighbors: [neighbor({ superseded: true })] }));
    expect(out).toContain('superseded');
  });

  it('renders the cold-memory line when neighbors is empty', () => {
    const out = formatReflect(packet({ neighbors: [] }));
    expect(out).toMatch(/cold/);
  });

  it('whitespace-collapses and truncates long neighbor text', () => {
    const longText = ('word '.repeat(60) + '\nmore\ttext ').repeat(1); // >200 chars, has whitespace/newlines
    expect(longText.length).toBeGreaterThan(200);
    const out = formatReflect(packet({ neighbors: [neighbor({ text: longText })] }));
    const neighborLine = out.split('\n').find((l) => l.includes('[n1]'));
    expect(neighborLine).toBeDefined();
    expect(neighborLine as string).not.toContain('\n');
    expect((neighborLine as string).length).toBeLessThan(longText.length);
  });

  it('includes the instruction text', () => {
    const out = formatReflect(packet({ instruction: 'UNIQUE_INSTRUCTION_TEXT' }));
    expect(out).toContain('UNIQUE_INSTRUCTION_TEXT');
  });

  it('includes the writeBack string', () => {
    const out = formatReflect(packet({ writeBack: 'ui memory record insight --refs e1 --dir /proj' }));
    expect(out).toContain('ui memory record insight --refs e1 --dir /proj');
  });
});
