// Warm-retry (F3): the FIRST plugin command against a big/cold Figma file often
// exceeds its timeout — the plugin main thread is JIT-cold, fonts aren't loaded,
// and a whole design-system serialization is slow the first time. The identical
// second attempt almost always lands because the plugin is now warm. So a
// long-running command retries ONCE on a cold E_TIMEOUT (opt-in per command),
// instead of surfacing a spurious failure the user must re-issue by hand.
import { CliError } from './protocol-helpers.ts';

/** True when a failed attempt should be retried once because it timed out cold. */
export function shouldWarmRetry(err: unknown, attempt: number): boolean {
  if (attempt !== 1) return false; // one warm retry only — never loop
  const code = (err as { code?: string } | null)?.code;
  return code === 'E_TIMEOUT';
}

export interface WarmRetryOpts {
  /** Called once before the warm retry fires (e.g. to log/annotate). */
  onRetry?: (err: CliError) => void;
}

/**
 * Run `fn` (attempt 1); if it times out cold, run it once more (attempt 2).
 * `fn` receives the 1-based attempt number so callers may widen the per-attempt
 * timeout on the warm pass if they choose. Any non-timeout error, or a second
 * timeout, propagates unchanged.
 */
export async function runWithWarmRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: WarmRetryOpts = {},
): Promise<T> {
  try {
    return await fn(1);
  } catch (err) {
    if (!shouldWarmRetry(err, 1)) throw err;
    opts.onRetry?.(err as CliError);
    return fn(2);
  }
}
