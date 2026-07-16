// `mirror-verify` orchestration (spec-005 P5) — OFFLINE, through the same
// injected-Runner seam scan-design-system/scan-conventions use. It does not mock
// the broker or the plugin: it asserts the command's own contract — the wire
// sequence (scan → IMPORT_PAYLOAD → scan → cleanup), the empty-tokens payload,
// the scratch removal, and the shape of the JSON envelope. The verdict itself is
// structuralDiff's, unit-tested in structural-diff.test.ts; the round-trip truth
// is the fixed-point test's. Only a LIVE run on a real canvas proves all three at
// once — that is the owner-in-the-loop step this command exists to make one line.
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../cli/src/arg-parse.ts';
import { COMMAND_TIMEOUTS } from '../shared/protocol.ts';
import { execute, normalizeForDiff } from '../cli/src/commands/mirror-verify.ts';

interface Call { cmd: string; params: unknown; opts?: { timeoutMs?: number } }

const CARD = {
  type: 'FRAME', name: 'Card', width: 320, height: 200,
  layoutMode: 'VERTICAL', itemSpacing: 12,
  fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12, a: 1 } }],
  children: [{ type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 20 }],
};

/**
 * A runner standing in for the plugin: answers each EXEC_JS scan with the spec
 * queued for it, and IMPORT_PAYLOAD with a rebuilt id. `specs` is consumed in
 * order (specA, then specB).
 *
 * EVERY EXEC_JS reply is wrapped in the `{result, console, ms}` envelope, because
 * that is what the plugin actually returns (executor-ops.opExecJs). The earlier
 * fake answered with a BARE spec — the one divergence from the real transport, and
 * the reason a live rebuild died on `in set_name` while this suite stayed green:
 * mirror-verify was posting the envelope itself as IMPORT_PAYLOAD's rootNode.
 */
function execJsReply(result: unknown) {
  return { result, console: [], ms: 1 };
}

function fakePlugin(specs: unknown[], calls: Call[], warnings: string[] = []) {
  const queue = [...specs];
  return async (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => {
    calls.push({ cmd, params, opts });
    if (cmd === 'IMPORT_PAYLOAD') return { id: '99:1', name: 'Card', warnings };
    const code = String((params as { code: string }).code);
    if (code.includes('.remove()')) return execJsReply({ removed: true });
    return execJsReply(queue.shift());
  };
}

const OPTS = { keep: false, timeoutMs: 30_000 };

describe('mirror-verify — the round-trip wire sequence', () => {
  it('scans, rebuilds, re-scans, then removes the scratch node', async () => {
    const calls: Call[] = [];
    await execute('1:2', OPTS, fakePlugin([CARD, CARD], calls));
    expect(calls.map((c) => c.cmd)).toEqual(['EXEC_JS', 'IMPORT_PAYLOAD', 'EXEC_JS', 'EXEC_JS']);
    // The two scans target the ORIGINAL then the REBUILT node…
    expect(String((calls[0].params as { code: string }).code)).toContain('"1:2"');
    expect(String((calls[2].params as { code: string }).code)).toContain('"99:1"');
    // …and the last call removes the rebuild, not the original.
    const cleanup = String((calls[3].params as { code: string }).code);
    expect(cleanup).toContain('"99:1"');
    expect(cleanup).toContain('remove()');
  });

  it('rebuilds from specA with EMPTY tokens (a gate must not mint variables)', async () => {
    const calls: Call[] = [];
    await execute('1:2', OPTS, fakePlugin([CARD, CARD], calls));
    const p = calls[1].params as { payload: Record<string, unknown>; parentId?: string };
    expect(p.payload.rootNode).toEqual(CARD);
    expect(p.payload.tokens).toEqual({ colors: [], typography: [], spacing: [], radii: [], shadows: [] });
    expect(p.payload).toMatchObject({ version: 1, name: 'Card', width: 320, height: 200 });
    expect(calls[1].opts?.timeoutMs).toBe(COMMAND_TIMEOUTS.IMPORT_PAYLOAD);
  });

  it('threads --parent into the rebuild', async () => {
    const calls: Call[] = [];
    await execute('1:2', { ...OPTS, parentId: '7:7' }, fakePlugin([CARD, CARD], calls));
    expect((calls[1].params as { parentId?: string }).parentId).toBe('7:7');
  });

  it('--keep leaves the rebuild on the canvas (no removal call)', async () => {
    const calls: Call[] = [];
    const res = await execute('1:2', { ...OPTS, keep: true }, fakePlugin([CARD, CARD], calls));
    expect(calls.map((c) => c.cmd)).toEqual(['EXEC_JS', 'IMPORT_PAYLOAD', 'EXEC_JS']);
    expect(res.keptRebuild).toBe(true);
  });

  it('still removes the scratch node when the SECOND scan fails', async () => {
    const calls: Call[] = [];
    const runner = async (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, params, opts });
      if (cmd === 'IMPORT_PAYLOAD') return { id: '99:1' };
      const code = String((params as { code: string }).code);
      if (code.includes('"99:1"') && !code.includes('.remove()')) throw new Error('scan blew up');
      if (code.includes('.remove()')) return { removed: true };
      return CARD;
    };
    await expect(execute('1:2', OPTS, runner)).rejects.toThrow('scan blew up');
    expect(calls.at(-1)?.cmd).toBe('EXEC_JS');
    expect(String((calls.at(-1)?.params as { code: string }).code)).toContain('remove()');
  });
});

describe('mirror-verify — the verdict envelope', () => {
  it('reports equal + zero diffs when the node round-trips', async () => {
    const res = await execute('1:2', OPTS, fakePlugin([CARD, structuredClone(CARD)], []));
    expect(res).toMatchObject({ nodeId: '1:2', rebuiltId: '99:1', equal: true, diffCount: 0, keptRebuild: false });
    expect(res.diffs).toEqual([]);
  });

  it('reports the LOST field by path when it does not', async () => {
    const rebuilt = structuredClone(CARD);
    rebuilt.children[0].characters = 'Hi';
    const res = await execute('1:2', OPTS, fakePlugin([CARD, rebuilt], []));
    expect(res.equal).toBe(false);
    expect(res.diffCount).toBe(1);
    expect(res.diffs[0]).toEqual({ path: 'children[0].characters', left: 'Hello', right: 'Hi' });
  });

  it('surfaces the rebuild import warnings (e.g. a skipped token binding)', async () => {
    const warn = ['token bind fills→color/brand skipped on "Card": no variable named "color/brand"'];
    const res = await execute('1:2', OPTS, fakePlugin([CARD, CARD], [], warn));
    expect(res.warnings).toEqual(warn);
  });

  it('fails loudly when the rebuild returns no id', async () => {
    const runner = async (cmd: string) => (cmd === 'IMPORT_PAYLOAD' ? {} : execJsReply(CARD));
    await expect(execute('1:2', OPTS, runner)).rejects.toThrow('no rebuilt node id');
  });

  // LIVE REGRESSION (node 25575:353653, "Platform - Design System"): the rebuild died
  // with `in set_name: Property "name" failed validation: Required value missing`,
  // because rootNode was the EXEC_JS envelope — an object with no type and no name.
  it('rebuilds from the UNWRAPPED spec, never the EXEC_JS {result, console, ms} envelope', async () => {
    const calls: Call[] = [];
    await execute('1:2', OPTS, fakePlugin([CARD, CARD], calls));
    const root = (calls[1].params as { payload: { rootNode: Record<string, unknown>; name: unknown } }).payload;
    expect(root.rootNode).not.toHaveProperty('result'); // the envelope must not survive
    expect(root.rootNode.type).toBe('FRAME');
    expect(root.rootNode.name).toBe('Card');
    expect(root.name).toBe('Card'); // the payload name came from the spec, not the 'mirror-verify' fallback
  });

  it('fails loudly when the scan returns a reply that carries no spec', async () => {
    const runner = async () => execJsReply(null); // e.g. a walker that returned nothing
    await expect(execute('1:2', OPTS, runner)).rejects.toThrow('no usable spec');
  });
});

describe('mirror-verify — normalisation + args', () => {
  it('drops the ROOT x/y (the rebuild lands at the viewport centre, not the original coords)', () => {
    expect(normalizeForDiff({ type: 'FRAME', name: 'Card', x: 10, y: 20 })).toEqual({ type: 'FRAME', name: 'Card' });
  });

  it('keeps NESTED x/y — a child\'s coords are parent-relative, hence structural', async () => {
    const withKid = { ...CARD, x: 10, y: 20, children: [{ type: 'FRAME', name: 'Abs', x: 4, y: 4 }] };
    const moved = { ...CARD, x: 999, y: 999, children: [{ type: 'FRAME', name: 'Abs', x: 4, y: 8 }] };
    const res = await execute('1:2', OPTS, fakePlugin([withKid, moved], []));
    expect(res.diffs).toEqual([{ path: 'children[0].y', left: 4, right: 8 }]); // root x/y gone, child y kept
  });

  it('parses <nodeId> --parent --keep --timeout', () => {
    const a = parseArgs(['4296:1', '--parent', '7:7', '--keep', '--timeout', '45000']);
    expect(a.positionals[0]).toBe('4296:1');
    expect(a.str('parent')).toBe('7:7');
    expect(a.bool('keep')).toBe(true);
    expect(a.num('timeout')).toBe(45000);
  });
});
