// Broker client used by every CLI command: ensure broker → connect → send
// RequestMsg → await id-correlated ReplyMsg (reassembling chunked replies).
// Throws CliError {code,message}; timeouts come from shared COMMAND_TIMEOUTS.
import { unlinkSync } from 'node:fs';
import WebSocket from 'ws';
import {
  BROKER_FILE,
  COMMAND_TIMEOUTS,
  DEFAULT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  makeRequestId,
  type CommandName,
} from '../../../shared/protocol.ts';
import { ensureBroker } from './broker-discovery.ts';
import {
  ChunkAssembler,
  CliError,
  isChunkMsg,
  isEventMsg,
  isReplyMsg,
  parseWireMsg,
  rawToString,
  sendWireMsg,
} from './protocol-helpers.ts';

const CONNECT_TIMEOUT_MS = 4_000;
let requestCounter = 0;

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new CliError('E_NO_BROKER', `broker connect timed out on port ${port}`));
    }, CONNECT_TIMEOUT_MS);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(new CliError('E_NO_BROKER', `broker connect failed: ${err.message}`));
    });
  });
}

function exchange(ws: WebSocket, cmd: CommandName, params: unknown, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = makeRequestId(++requestCounter);
    const assembler = new ChunkAssembler();
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new CliError('E_TIMEOUT', `${cmd} timed out after ${timeoutMs}ms`))),
      timeoutMs,
    );

    ws.on('message', (raw) => {
      let msg = parseWireMsg(rawToString(raw));
      if (!msg) return;
      try {
        if (isChunkMsg(msg)) {
          if (msg.id !== id) return;
          const complete = assembler.accept(msg);
          if (!complete) return; // more frames coming
          msg = complete;
        }
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (isEventMsg(msg)) {
        const { type, data } = msg;
        if (type === 'PLUGIN_GONE') {
          finish(() => reject(new CliError('E_NO_PLUGIN', 'Figma plugin disconnected while waiting for the reply')));
        } else if (type === 'BROKER_HELLO' && data.protocolV !== undefined && data.protocolV !== PROTOCOL_VERSION) {
          finish(() => reject(new CliError('E_VERSION_MISMATCH', `broker speaks protocol v${String(data.protocolV)}, CLI expects v${PROTOCOL_VERSION}`)));
        }
        return;
      }
      if (isReplyMsg(msg) && msg.id === id) {
        const reply = msg;
        finish(() => {
          if (reply.ok) resolve(reply.result);
          else reject(new CliError(reply.error.code, reply.error.message));
        });
      }
    });
    ws.on('close', () => finish(() => reject(new CliError('E_NO_BROKER', 'broker connection closed before the reply arrived'))));
    ws.on('error', (err) => finish(() => reject(new CliError('E_NO_BROKER', `broker socket error: ${err.message}`))));

    try {
      sendWireMsg(ws, { id, cmd, params, v: PROTOCOL_VERSION });
    } catch (err) {
      finish(() => reject(new CliError('E_NO_BROKER', `failed to send request: ${(err as Error).message}`)));
    }
  });
}

/**
 * Connect, read the broker's BROKER_HELLO greeting (port, pid, uptime, protocol,
 * plugin liveness), and close — no plugin round-trip. Used by `figma-agent
 * status` to report broker + connection health even when the plugin is absent.
 */
export function fetchBrokerHello(port: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new CliError('E_NO_BROKER', `broker hello timed out on port ${port}`));
    }, CONNECT_TIMEOUT_MS);
    const done = (fn: () => void): void => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    };
    ws.on('message', (raw) => {
      const msg = parseWireMsg(rawToString(raw));
      if (msg && isEventMsg(msg) && msg.type === 'BROKER_HELLO') done(() => resolve(msg.data));
    });
    ws.once('error', (err) => done(() => reject(new CliError('E_NO_BROKER', `broker hello failed: ${err.message}`))));
    ws.once('close', () => { clearTimeout(timer); reject(new CliError('E_NO_BROKER', 'broker closed before hello')); });
  });
}

/**
 * Run one command through the broker. Connect failure after a valid
 * advertisement forces one rediscovery (broker may have just died).
 */
export async function runCommand(cmd: string, params: unknown, opts?: { timeoutMs?: number }): Promise<unknown> {
  const wireCmd = cmd as CommandName;
  let ad = await ensureBroker();
  let ws: WebSocket;
  try {
    ws = await connectWs(ad.port);
  } catch {
    try {
      unlinkSync(BROKER_FILE); // advertisement lied — drop it and respawn
    } catch {
      /* already gone */
    }
    ad = await ensureBroker();
    ws = await connectWs(ad.port);
  }

  const timeoutMs = opts?.timeoutMs ?? COMMAND_TIMEOUTS[wireCmd] ?? DEFAULT_TIMEOUT_MS;
  try {
    return await exchange(ws, wireCmd, params, timeoutMs);
  } finally {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
