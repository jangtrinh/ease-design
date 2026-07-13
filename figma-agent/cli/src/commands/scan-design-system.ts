// `figma-agent scan-design-system` — components/variables/styles registry.
// With --out the full registry goes to a file and only {path,counts} prints.
// --timeout <ms> raises the per-attempt wire timeout (default SCAN_DESIGN_SYSTEM);
// a cold first attempt that times out is retried ONCE warm (see warm-retry.ts).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMAND_TIMEOUTS } from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';
import { runWithWarmRetry } from '../transport/warm-retry.ts';

/** A command runner (the SCAN_DESIGN_SYSTEM transport call), injectable for tests. */
export type Runner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

export interface ScanDesignSystemResult {
  path?: string;
  counts?: unknown;
  /** Full registry (only when --out was NOT given). */
  registry?: unknown;
}

/**
 * Decoupled from CommandArgs + the real transport so it is unit-testable with a
 * stub runner and a temp --out path. `timeoutMs` overrides the default per-attempt
 * timeout; a cold E_TIMEOUT triggers exactly one warm retry.
 */
export async function execute(
  outPath: string | undefined,
  timeoutMs: number | undefined,
  runner: Runner = runCommand,
): Promise<ScanDesignSystemResult> {
  const perAttempt = timeoutMs ?? COMMAND_TIMEOUTS.SCAN_DESIGN_SYSTEM;
  const result = await runWithWarmRetry(() =>
    runner('SCAN_DESIGN_SYSTEM', {}, perAttempt ? { timeoutMs: perAttempt } : undefined),
  );

  if (outPath === undefined) return { registry: result };
  const abs = resolve(outPath);
  writeFileSync(abs, JSON.stringify(result, null, 2));
  const counts = (result as { counts?: unknown } | null)?.counts ?? null;
  return { path: abs, counts };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const res = await execute(args.str('out'), args.num('timeout'));
  // Preserve the historical stdout shape: bare registry when no --out.
  return res.path !== undefined ? { path: res.path, counts: res.counts } : res.registry;
}
