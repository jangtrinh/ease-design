// Persistent WS broker daemon (`figma-agent __broker`): binds the first free
// port in 9410-9419, advertises itself in /tmp, and relays request/reply frames
// between the single Figma plugin and ephemeral CLI clients (pure relay — never
// interprets `cmd`). Design: a persistent broker-daemon pattern (one long-lived
// relay process, hot-swappable across CLI rebuilds), adapted from
// southleft/figma-console-mcp's websocket-server pending-request correlation
// (347-360) / heartbeat (672-685).
import { appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import WebSocket, { WebSocketServer } from 'ws';
import {
  BROKER_FILE, BROKER_IDLE_SHUTDOWN_MS, HEARTBEAT_INTERVAL_MS, PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type BrokerAdvertisement, type ErrorCode, type EventMsg, type ReplyErr,
} from '../../../shared/protocol.ts';
import { isPidAlive, readAdvertisement, selfBuildMtime, writeAdvertisement } from './broker-discovery.ts';
import { isChunkMsg, isEventMsg, isReplyMsg, isRequestMsg, parseWireMsg, rawToString } from './protocol-helpers.ts';

const LOG_FILE = '/tmp/figma-agent-broker.log';
const IDLE_CHECK_MS = 60_000;

type TrackedWs = WebSocket & { isAlive?: boolean };

interface BrokerState {
  pluginWs: WebSocket | null;
  pluginInfo: Record<string, unknown> | null;
  cliClients: Set<WebSocket>;
  pending: Map<string, WebSocket>; // request id → CLI client awaiting the reply
  lastBusyAt: number;
}

function log(line: string): void {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} [${process.pid}] ${line}\n`);
  } catch { /* logging is best-effort */ }
}

function tryBind(port: number, host: string): Promise<WebSocketServer | null> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host, port });
    wss.once('listening', () => resolve(wss));
    wss.once('error', () => resolve(null)); // EADDRINUSE / EAFNOSUPPORT → skip
  });
}

function sendReplyErr(ws: WebSocket, id: string, code: ErrorCode, message: string): void {
  const reply: ReplyErr = { id, ok: false, error: { code, message } };
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
  } catch { /* client already gone */ }
}

export async function runBrokerDaemon(): Promise<void> {
  // Refuse to double-start when a live same-or-newer broker already advertises.
  const existing = readAdvertisement();
  if (existing && existing.pid !== process.pid && isPidAlive(existing.pid) &&
      existing.protocolV === PROTOCOL_VERSION && existing.buildMtime >= selfBuildMtime() - 1) {
    log(`another broker (pid ${existing.pid}) already live — exiting`);
    process.exit(0);
  }

  let wss: WebSocketServer | null = null;
  let port = 0;
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END && !wss; p++) {
    wss = await tryBind(p, '127.0.0.1');
    if (wss) port = p;
  }
  if (!wss) {
    log(`no free port in ${PORT_RANGE_START}-${PORT_RANGE_END} — exiting`);
    process.exit(1);
  }
  // Also bind the IPv6 loopback on the same port: Figma's Chromium may resolve
  // `localhost` to ::1 first, which an IPv4-only listener silently refuses.
  const wss6 = await tryBind(port, '::1');
  if (!wss6) log('IPv6 loopback (::1) bind unavailable — IPv4 only');

  const startedAt = Date.now();
  const st: BrokerState = { pluginWs: null, pluginInfo: null, cliClients: new Set(), pending: new Map(), lastBusyAt: Date.now() };
  writeAdvertisement(port, startedAt);
  log(`broker listening on 127.0.0.1:${port}${wss6 ? ' + [::1]:' + port : ''}`);

  const shutdown = (code: number, reason: string): never => {
    log(`shutdown (${reason})`);
    try {
      // Only remove the advertisement if it is still ours (a newer broker may own it).
      const ad = JSON.parse(readFileSync(BROKER_FILE, 'utf8')) as BrokerAdvertisement;
      if (ad.pid === process.pid) unlinkSync(BROKER_FILE);
    } catch { /* already gone */ }
    try { wss?.close(); } catch { /* ignore */ }
    try { wss6?.close(); } catch { /* ignore */ }
    process.exit(code);
  };

  const broadcastToClients = (text: string): void => {
    for (const client of st.cliClients) {
      try { if (client.readyState === WebSocket.OPEN) client.send(text); }
      catch { /* skip dead client */ }
    }
  };

  const forwardToPlugin = (from: WebSocket, id: string, rawText: string): void => {
    if (!st.pluginWs || st.pluginWs.readyState !== WebSocket.OPEN) {
      sendReplyErr(from, id, 'E_NO_PLUGIN', 'no Figma plugin connected — open the figma-agent plugin in Figma');
      return;
    }
    st.pending.set(id, from);
    try { st.pluginWs.send(rawText); }
    catch (err) {
      st.pending.delete(id);
      sendReplyErr(from, id, 'E_PLUGIN_ERROR', `relay to plugin failed: ${(err as Error).message}`);
    }
  };

  const routeFromPlugin = (id: string, rawText: string, final: boolean): void => {
    const client = st.pending.get(id);
    if (!client) return;
    try { if (client.readyState === WebSocket.OPEN) client.send(rawText); }
    catch { /* requester vanished */ }
    if (final) st.pending.delete(id);
  };

  const handleClose = (ws: WebSocket): void => {
    if (ws === st.pluginWs) {
      st.pluginWs = null;
      st.pluginInfo = null;
      log('plugin disconnected → PLUGIN_GONE');
      for (const [id, client] of st.pending) sendReplyErr(client, id, 'E_NO_PLUGIN', 'Figma plugin disconnected mid-request');
      st.pending.clear();
      broadcastToClients(JSON.stringify({ type: 'PLUGIN_GONE', data: {} } satisfies EventMsg));
    } else {
      st.cliClients.delete(ws);
      for (const [id, client] of st.pending) if (client === ws) st.pending.delete(id);
    }
  };

  const handleMessage = (ws: WebSocket, text: string): void => {
    const msg = parseWireMsg(text);
    if (!msg) return;
    // Hidden control frame from a newer CLI build replacing this broker.
    if ((msg as { type?: string }).type === 'BROKER_SHUTDOWN_REQUEST') shutdown(0, 'BROKER_SHUTDOWN_REQUEST');
    if (isChunkMsg(msg)) {
      // Pass-through both ways — the broker never reassembles chunks.
      if (ws === st.pluginWs) routeFromPlugin(msg.id, text, msg.last);
      else forwardToPlugin(ws, msg.id, text);
    } else if (isReplyMsg(msg)) {
      if (ws === st.pluginWs) routeFromPlugin(msg.id, text, true);
    } else if (isRequestMsg(msg)) {
      forwardToPlugin(ws, msg.id, text);
    } else if (isEventMsg(msg)) {
      if (msg.type === 'PLUGIN_HELLO') {
        if (st.pluginWs && st.pluginWs !== ws) st.pluginWs.terminate(); // single-plugin model
        st.cliClients.delete(ws);
        st.pluginWs = ws;
        st.pluginInfo = msg.data;
        log(`plugin registered: ${JSON.stringify(msg.data)}`);
      } else if (ws === st.pluginWs) {
        broadcastToClients(text); // FILE_INFO etc. fan out to CLI clients
      }
    }
  };

  const onConnection = (ws: WebSocket, req: import('node:http').IncomingMessage): void => {
    const tracked = ws as TrackedWs;
    tracked.isAlive = true;
    st.cliClients.add(ws); // provisional; promoted to plugin on PLUGIN_HELLO
    st.lastBusyAt = Date.now();
    log(`connection from ${req.socket.remoteAddress ?? '?'} (clients: ${st.cliClients.size})`);
    ws.on('pong', () => { tracked.isAlive = true; });
    ws.on('error', (err) => log(`ws error: ${err.message}`));
    ws.on('message', (raw) => {
      try { handleMessage(ws, rawToString(raw)); }
      catch (err) { log(`handleMessage failed: ${(err as Error).message}`); }
    });
    ws.on('close', () => handleClose(ws));
    const hello: EventMsg = {
      type: 'BROKER_HELLO',
      data: { port, pid: process.pid, protocolV: PROTOCOL_VERSION, buildMtime: selfBuildMtime(), pluginConnected: !!st.pluginWs, pluginInfo: st.pluginInfo ?? null },
    };
    try { ws.send(JSON.stringify(hello)); } catch { /* ignore */ }
  };
  wss.on('connection', onConnection);
  wss6?.on('connection', onConnection);

  // Heartbeat: ping every 30s; drop sockets that missed the previous pong.
  setInterval(() => {
    const allClients = [...wss!.clients, ...(wss6 ? wss6.clients : [])];
    for (const ws of allClients) {
      const tracked = ws as TrackedWs;
      if (tracked.isAlive === false) { log('terminating unresponsive client (missed pong)'); tracked.terminate(); continue; }
      tracked.isAlive = false;
      tracked.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Advertisement refresh (30s); yield if a different live broker took over.
  setInterval(() => {
    const ad = readAdvertisement();
    if (ad && ad.pid !== process.pid && isPidAlive(ad.pid)) shutdown(0, `replaced by broker pid ${ad.pid}`);
    writeAdvertisement(port, startedAt);
  }, HEARTBEAT_INTERVAL_MS);

  // Idle shutdown: no plugin AND no CLI clients for 30 min.
  setInterval(() => {
    if (st.pluginWs || st.cliClients.size > 0) st.lastBusyAt = Date.now();
    else if (Date.now() - st.lastBusyAt > BROKER_IDLE_SHUTDOWN_MS) shutdown(0, 'idle for 30min');
  }, IDLE_CHECK_MS);

  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err.message}`));
}
