// `figma-agent status` — broker {port,pid} from the advertisement + live
// plugin info (fileName/page/user) from a STATUS round-trip.
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';
import { ensureBroker } from '../transport/broker-discovery.ts';

export async function run(_args: CommandArgs): Promise<unknown> {
  const ad = await ensureBroker();
  const plugin = await runCommand('STATUS', {});
  return { broker: { port: ad.port, pid: ad.pid }, plugin };
}
