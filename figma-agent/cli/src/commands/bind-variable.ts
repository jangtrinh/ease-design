// `figma-agent bind-variable` — setBoundVariable on a node field
// (fills|strokes|cornerRadius|itemSpacing|padding*|…), variable by id or name.
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('BIND_VARIABLE', {
    nodeId: args.req('node'),
    field: args.req('field'),
    variable: args.req('variable'),
  });
}
