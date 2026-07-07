// `figma-agent set-variant` — instance.setProperties from --props k=v,k2=v2.
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const nodeId = args.req('node');
  const props: Record<string, string> = {};
  for (const pair of args.req('props').split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new CliError('E_INVALID_ARGS', `--props expects k=v pairs, got "${pair}"`);
    props[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return runCommand('SET_VARIANT', { nodeId, props });
}
