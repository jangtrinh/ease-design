// `figma-agent get-selection` — serialize the current Figma selection
// (id/name/type/bounds, children to --depth).
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const depth = args.num('depth') ?? 1;
  return runCommand('GET_SELECTION', { depth });
}
