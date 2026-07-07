// `figma-agent create-instance` — instantiate a component by key (library,
// importComponentByKeyAsync) or local node id.
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('CREATE_INSTANCE', {
    component: args.req('component'),
    parentId: args.str('parent'),
  });
}
