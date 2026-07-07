// `figma-agent create-frame` — figma.createFrame with geometry / optional parent.
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('CREATE_FRAME', {
    name: args.req('name'),
    width: args.num('w'),
    height: args.num('h'),
    parentId: args.str('parent'),
    x: args.num('x'),
    y: args.num('y'),
  });
}
