// F3 stability — the one-shot warm retry for cold plugin timeouts. The decision
// function is pure; the runner wrapper must retry EXACTLY once and only on a cold
// E_TIMEOUT, so a spurious first-attempt timeout self-heals but real errors don't
// loop.
import { describe, it, expect, vi } from 'vitest';
import { runWithWarmRetry, shouldWarmRetry } from '../cli/src/transport/warm-retry.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';

describe('shouldWarmRetry — cold-timeout-only, once', () => {
  it('retries a first-attempt E_TIMEOUT', () => {
    expect(shouldWarmRetry(new CliError('E_TIMEOUT', 'x'), 1)).toBe(true);
  });
  it('does not retry a second attempt', () => {
    expect(shouldWarmRetry(new CliError('E_TIMEOUT', 'x'), 2)).toBe(false);
  });
  it('does not retry non-timeout errors', () => {
    for (const code of ['E_NO_PLUGIN', 'E_PLUGIN_ERROR', 'E_EVAL'] as const) {
      expect(shouldWarmRetry(new CliError(code, 'x'), 1)).toBe(false);
    }
  });
});

describe('runWithWarmRetry — behaviour', () => {
  it('returns the first result without retrying on success', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(runWithWarmRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once on a cold E_TIMEOUT then succeeds (plugin now warm)', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn(async (attempt: number) => {
      if (attempt === 1) throw new CliError('E_TIMEOUT', 'cold');
      return 'warm-ok';
    });
    await expect(runWithWarmRetry(fn, { onRetry })).resolves.toBe('warm-ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('propagates a second timeout (no infinite loop)', async () => {
    const fn = vi.fn(async () => { throw new CliError('E_TIMEOUT', 'still cold'); });
    await expect(runWithWarmRetry(fn)).rejects.toThrow(/still cold/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-timeout error', async () => {
    const fn = vi.fn(async () => { throw new CliError('E_PLUGIN_ERROR', 'boom'); });
    await expect(runWithWarmRetry(fn)).rejects.toThrow(/boom/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
