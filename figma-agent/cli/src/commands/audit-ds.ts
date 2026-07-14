// `figma-agent audit-ds` — DS-hygiene audit of the open file's component library.
// The plugin (AUDIT_DS) returns RAW facts; this command runs the pure detect core over
// them. With --out the full report goes to a file and only {path,file,summary} prints;
// without it the whole report prints. --timeout <ms> raises the per-attempt wire timeout
// (default AUDIT_DS); a cold first attempt that times out is retried ONCE warm.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMAND_TIMEOUTS } from '../../../shared/protocol.ts';
import type { AuditDsFacts } from '../../../shared/audit-types.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';
import { runWithWarmRetry } from '../transport/warm-retry.ts';
import { detectAudit, type AuditReport } from './audit-ds-detect.ts';

/** A command runner (the AUDIT_DS transport call), injectable for tests. */
export type Runner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

export interface AuditDsResult {
  path?: string;
  file?: AuditReport['file'];
  summary?: AuditReport['summary'];
  /** Full report (only when --out was NOT given). */
  report?: AuditReport;
}

/**
 * Decoupled from CommandArgs + the real transport so it is unit-testable with a stub
 * runner and a temp --out path. `timeoutMs` overrides the default per-attempt timeout;
 * a cold E_TIMEOUT triggers exactly one warm retry. The plugin returns raw facts; the
 * detect core (pure) turns them into the report here on the CLI side.
 */
export async function execute(
  outPath: string | undefined,
  timeoutMs: number | undefined,
  runner: Runner = runCommand,
): Promise<AuditDsResult> {
  const perAttempt = timeoutMs ?? COMMAND_TIMEOUTS.AUDIT_DS;
  const facts = (await runWithWarmRetry(() =>
    runner('AUDIT_DS', {}, perAttempt ? { timeoutMs: perAttempt } : undefined),
  )) as AuditDsFacts;
  const report = detectAudit(facts);

  if (outPath === undefined) return { report };
  const abs = resolve(outPath);
  writeFileSync(abs, JSON.stringify(report, null, 2));
  return { path: abs, file: report.file, summary: report.summary };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const res = await execute(args.str('out'), args.num('timeout'));
  // With --out stdout is the compact {path,file,summary}; without it, the full report.
  return res.path !== undefined ? { path: res.path, file: res.file, summary: res.summary } : res.report;
}
