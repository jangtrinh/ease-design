// `figma-agent status` — broker {port,pid,uptime,protocolVersion} from a
// BROKER_HELLO read, plus plugin {connected,state,lastHeartbeatAge,...scene}.
// Never throws E_NO_PLUGIN: an absent plugin is reported as connected:false so
// `status` stays a diagnosis tool, not another command that fails when nobody's
// listening.
import { PROTOCOL_VERSION } from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { fetchBrokerHello, runCommand } from '../transport/broker-client.ts';
import { ensureBroker } from '../transport/broker-discovery.ts';
import { CliError } from '../transport/protocol-helpers.ts';

export async function run(_args: CommandArgs): Promise<unknown> {
  const ad = await ensureBroker();

  let hello: Record<string, unknown> = {};
  try {
    hello = await fetchBrokerHello(ad.port);
  } catch {
    /* fall back to the advertisement fields below */
  }

  const broker = {
    port: ad.port,
    pid: ad.pid,
    uptimeMs: (hello.uptimeMs as number | undefined) ?? null,
    protocolVersion: (hello.protocolV as number | undefined) ?? PROTOCOL_VERSION,
  };
  const connected = hello.pluginConnected === true;
  const lastHeartbeatAge = (hello.lastHeartbeatAge as number | null | undefined) ?? null;
  const state = (hello.pluginState as string | undefined) ?? (connected ? 'connected' : 'disconnected');

  // Only round-trip the plugin for scene info when the broker says it is present.
  let scene: unknown = null;
  if (connected) {
    try {
      scene = await runCommand('STATUS', {});
    } catch (err) {
      if (!(err instanceof CliError && err.code === 'E_NO_PLUGIN')) throw err;
      // Raced: plugin left between the hello and the STATUS round-trip.
      return { broker, plugin: { connected: false, state: 'disconnected', lastHeartbeatAge: null }, protocolVersion: broker.protocolVersion };
    }
  }

  return {
    broker,
    plugin: { connected, state, lastHeartbeatAge, ...(scene && typeof scene === 'object' ? scene : {}) },
    protocolVersion: broker.protocolVersion,
  };
}
