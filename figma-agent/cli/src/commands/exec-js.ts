// `figma-agent exec-js <file|->` — run arbitrary Plugin-API JS on the plugin
// main thread. --timeout (ms) raises the default, hard-capped at 120s.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMAND_TIMEOUTS,
  EXEC_JS_MAX_TIMEOUT_MS,
} from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import { readStdin } from '../util/read-stdin.ts';

const WIRE_MARGIN_MS = 2_000; // socket timeout slightly above plugin-side timeout

export async function run(args: CommandArgs): Promise<unknown> {
  const fileArg = args.positionals[0];
  let code: string;
  if (!fileArg || fileArg === '-') {
    code = await readStdin();
  } else {
    try {
      code = readFileSync(resolve(fileArg), 'utf8');
    } catch (err) {
      throw new CliError('E_INVALID_ARGS', `cannot read script file "${fileArg}": ${(err as Error).message}`);
    }
  }
  if (!code.trim()) throw new CliError('E_INVALID_ARGS', 'script input is empty');

  const requested = args.num('timeout') ?? COMMAND_TIMEOUTS.EXEC_JS ?? 30_000;
  const timeoutMs = Math.min(requested, EXEC_JS_MAX_TIMEOUT_MS);
  return runCommand('EXEC_JS', { code, timeoutMs }, { timeoutMs: timeoutMs + WIRE_MARGIN_MS });
}
