// `audit-ds` command execute() — the CLI seam that runs AUDIT_DS (via a stub runner)
// and turns the raw facts into a report. Mirrors scan-design-system's timeout/--out
// contract: with --out the full report is written and the compact {path,file,summary}
// returned; without --out the whole report comes back inline.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, type Runner } from '../cli/src/commands/audit-ds.ts';
import { COMMAND_TIMEOUTS } from '../shared/protocol.ts';
import type { AuditDsFacts } from '../shared/audit-types.ts';

const FIXTURE: AuditDsFacts = {
  file: { fileName: 'VSF - PCP', pages: [{ id: 'p1', name: 'Page 1' }], skippedPages: [] },
  components: [
    {
      id: 'c1', key: 'k1', name: 'Component 10', type: 'COMPONENT_SET',
      variantCount: 2, variantAxes: {}, pageName: 'Page 1', section: null,
      deprecatedData: false, childTypeSignature: ['TEXT'], unboundFills: 0, unboundStrokes: 0,
    },
    {
      id: 'c2', key: 'k2', name: 'Button', type: 'COMPONENT',
      variantCount: 0, variantAxes: {}, pageName: 'Page 1', section: '01 · Primitives',
      deprecatedData: false, childTypeSignature: [], unboundFills: 0, unboundStrokes: 0,
    },
  ],
  usage: { byMainId: { c2: 12 }, pagesById: { c2: ['Page 1'] }, unresolved: 0 },
  counts: { components: 1, sets: 1, instancesTallied: 12 },
};

/** A runner that asserts the wire command and returns the fixture facts. */
function stubRunner(facts: AuditDsFacts): Runner {
  return async (cmd) => {
    expect(cmd).toBe('AUDIT_DS');
    return facts;
  };
}

describe('audit-ds — execute()', () => {
  it('with --out writes the FULL report and returns the compact {path,file,summary}', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-ds-'));
    const out = join(dir, 'report.json');
    const res = await execute(out, undefined, stubRunner(FIXTURE));
    expect(res.path).toBe(out);
    expect(res.file?.fileName).toBe('VSF - PCP');
    expect(res.summary?.total).toBe(2);
    expect(res.report).toBeUndefined();

    expect(existsSync(out)).toBe(true);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.file.fileName).toBe('VSF - PCP');
    expect(written.summary.total).toBe(2);
    expect(written.components.length).toBe(2); // the FULL report lands on disk, not the compact shape
  });

  it('without --out returns the full report inline (detectors ran)', async () => {
    const res = await execute(undefined, undefined, stubRunner(FIXTURE));
    expect(res.path).toBeUndefined();
    expect(res.report?.file.fileName).toBe('VSF - PCP');
    expect(res.report?.components.length).toBe(2);
    const c1 = res.report?.components.find((c) => c.id === 'c1');
    expect(c1?.flags.map((f) => f.id)).toContain('junk-name');
  });

  it('threads an explicit --timeout into the transport opts', async () => {
    const calls: { opts?: { timeoutMs?: number } }[] = [];
    const runner: Runner = async (_cmd, _params, opts) => { calls.push({ opts }); return FIXTURE; };
    await execute(undefined, 7000, runner);
    expect(calls[0]?.opts?.timeoutMs).toBe(7000);
  });

  it('falls back to the AUDIT_DS default timeout when no flag is given', async () => {
    const calls: { opts?: { timeoutMs?: number } }[] = [];
    const runner: Runner = async (_cmd, _params, opts) => { calls.push({ opts }); return FIXTURE; };
    await execute(undefined, undefined, runner);
    expect(calls[0]?.opts?.timeoutMs).toBe(COMMAND_TIMEOUTS.AUDIT_DS);
  });
});
