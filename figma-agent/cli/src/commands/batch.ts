// `figma-agent batch <file.json>` — send a JSON array of {cmd,params} as ONE
// BATCH request (single round-trip; plugin executes sequentially).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMANDS, type CommandName } from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

interface BatchOp {
  cmd: CommandName;
  params: unknown;
}

function loadOps(filePath: string): BatchOp[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new CliError('E_INVALID_ARGS', `cannot read batch file "${filePath}": ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new CliError('E_INVALID_ARGS', 'batch file must be a non-empty JSON array of {cmd,params}');
  }
  return parsed.map((op, i) => {
    const candidate = op as { cmd?: unknown; params?: unknown };
    if (typeof candidate?.cmd !== 'string' || !(COMMANDS as readonly string[]).includes(candidate.cmd)) {
      throw new CliError('E_INVALID_ARGS', `batch[${i}].cmd invalid — must be one of: ${COMMANDS.join(', ')}`);
    }
    return { cmd: candidate.cmd as CommandName, params: candidate.params ?? {} };
  });
}

export async function run(args: CommandArgs): Promise<unknown> {
  const fileArg = args.positionals[0];
  if (!fileArg) throw new CliError('E_INVALID_ARGS', 'usage: figma-agent batch <file.json> [--stop-on-error]');
  const ops = loadOps(resolve(fileArg));
  return runCommand('BATCH', { ops, stopOnError: args.bool('stop-on-error') });
}
