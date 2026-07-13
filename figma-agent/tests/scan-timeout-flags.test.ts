// F3 stability — the --timeout flag on the long-running scan commands and the
// warm-retry wiring. Covers: parseArgs reads --timeout; scan-design-system and
// scan-conventions thread the per-attempt timeout into the transport; a cold
// E_TIMEOUT triggers exactly one warm retry.
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../cli/src/arg-parse.ts';
import { COMMAND_TIMEOUTS } from '../shared/protocol.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';
import { execute as scanDs, type Runner as DsRunner } from '../cli/src/commands/scan-design-system.ts';
import {
  execute as scanConv, DEFAULT_WALK_TIMEOUT_MS, DEFAULT_BUDGET,
  type Runner as ConvRunner,
} from '../cli/src/commands/scan-conventions.ts';

interface Call { cmd: string; params: unknown; opts?: { timeoutMs?: number } }

/** A runner that records its calls and returns a fixed reply. */
function recorder(reply: unknown, calls: Call[]): DsRunner & ConvRunner {
  return async (cmd, params, opts) => {
    calls.push({ cmd, params, opts });
    return reply;
  };
}

describe('parseArgs — --timeout parsing', () => {
  it('reads --timeout as a number alongside positionals and other flags', () => {
    const a = parseArgs(['4296:1', '5:2', '--timeout', '45000', '--budget', '9000', '--out', 'dna.json']);
    expect(a.num('timeout')).toBe(45000);
    expect(a.num('budget')).toBe(9000);
    expect(a.str('out')).toBe('dna.json');
    expect(a.positionals).toEqual(['4296:1', '5:2']);
  });

  it('supports --timeout=NNN and is undefined when absent', () => {
    expect(parseArgs(['--timeout=12000']).num('timeout')).toBe(12000);
    expect(parseArgs([]).num('timeout')).toBeUndefined();
  });
});

describe('scan-design-system — timeout threading + warm retry', () => {
  it('threads an explicit --timeout into the transport opts', async () => {
    const calls: Call[] = [];
    await scanDs(undefined, 5000, recorder({ counts: { components: 3 } }, calls));
    expect(calls[0]?.cmd).toBe('SCAN_DESIGN_SYSTEM');
    expect(calls[0]?.opts?.timeoutMs).toBe(5000);
  });

  it('falls back to the default per-attempt timeout when no flag is given', async () => {
    const calls: Call[] = [];
    const res = await scanDs(undefined, undefined, recorder({ counts: {} }, calls));
    expect(calls[0]?.opts?.timeoutMs).toBe(COMMAND_TIMEOUTS.SCAN_DESIGN_SYSTEM);
    expect(res.registry).toEqual({ counts: {} });
  });

  it('warm-retries once on a cold E_TIMEOUT then returns the registry', async () => {
    const calls: Call[] = [];
    let n = 0;
    const runner: DsRunner = async (cmd, params, opts) => {
      calls.push({ cmd, params, opts });
      if (++n === 1) throw new CliError('E_TIMEOUT', 'cold scan');
      return { counts: { components: 9 } };
    };
    const res = await scanDs(undefined, 30000, runner);
    expect(calls).toHaveLength(2); // cold attempt + warm retry
    expect(res.registry).toEqual({ counts: { components: 9 } });
  });
});

describe('scan-conventions — walk-timeout threading', () => {
  it('threads --timeout into both the plugin walk arg and the wire margin', async () => {
    const calls: Call[] = [];
    await scanConv(['1:1'], DEFAULT_BUDGET, undefined, recorder({ result: [] }, calls), 45000);
    const p = calls[0]?.params as { timeoutMs?: number };
    expect(p.timeoutMs).toBe(45000); // plugin-side walk timeout
    expect(calls[0]?.opts?.timeoutMs).toBe(45000 + 2000); // wire margin above it
  });

  it('defaults to DEFAULT_WALK_TIMEOUT_MS when no --timeout is passed', async () => {
    const calls: Call[] = [];
    await scanConv(['1:1'], DEFAULT_BUDGET, undefined, recorder({ result: [] }, calls));
    expect((calls[0]?.params as { timeoutMs?: number }).timeoutMs).toBe(DEFAULT_WALK_TIMEOUT_MS);
  });
});
