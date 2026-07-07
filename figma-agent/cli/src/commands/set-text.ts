// `figma-agent set-text` — set characters (+ optional font/size/weight);
// the plugin loads the best matching font (executor loadBestFont chain).
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('SET_TEXT', {
    nodeId: args.req('node'),
    characters: args.req('chars'),
    fontFamily: args.str('font'),
    fontSize: args.num('size'),
    fontWeight: args.num('weight'),
  });
}
