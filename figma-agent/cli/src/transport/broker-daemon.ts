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
  BROKER_FILE, BROKER_IDLE_SHUTDOWN_MS, HEARTBEAT_INTERVAL_MS, PLUGIN_WAIT_MS,
  PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type BrokerAdvertisement, type ErrorCode, type EventMsg, type ReplyErr,
} from '../../../shared/protocol.ts';
import { isPidAlive, readAdvertisement, selfBuildMtime, writeAdvertisement } from './broker-discovery.ts';
import { isChunkMsg, isEventMsg, isReplyMsg, isRequestMsg, parseWireMsg, rawToString } from './protocol-helpers.ts';

const LOG_FILE = '/tmp/figma-agent-broker.log';

/** Read a positive-integer env override, else fall back. Lets manual acceptance
 *  shrink the idle-shutdown / heartbeat / plugin-wait knobs to seconds. */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const IDLE_SHUTDOWN_MS = envMs('FIGMA_AGENT_IDLE_SHUTDOWN_MS', BROKER_IDLE_SHUTDOWN_MS);
const HEARTBEAT_MS = envMs('FIGMA_AGENT_HEARTBEAT_MS', HEARTBEAT_INTERVAL_MS);
const PLUGIN_WAIT_TIMEOUT_MS = envMs('FIGMA_AGENT_PLUGIN_WAIT_MS', PLUGIN_WAIT_MS);
// Idle check cadence scales with the (possibly shrunk) idle window so a 5s test
// override actually fires within a few seconds, not the fixed 60s of production.
const IDLE_CHECK_MS = Math.min(60_000, Math.max(500, Math.floor(IDLE_SHUTDOWN_MS / 3)));

// Commands answered instantly with E_NO_PLUGIN when no plugin is connected —
// never parked in the plugin-wait queue (a status probe must not hang 12s).
const WAIT_EXEMPT = new Set(['STATUS']);

type TrackedWs = WebSocket & { isAlive?: boolean };

/** A request parked until a plugin (re)connects or the wait window elapses. */
interface ParkedRequest {
  id: string;
  from: WebSocket;
  rawText: string;
  deadline: number;
}

interface BrokerState {
  pluginWs: WebSocket | null;
  pluginInfo: Record<string, unknown> | null;
  cliClients: Set<WebSocket>;
  pending: Map<string, WebSocket>; // request id → CLI client awaiting the reply
  waiting: ParkedRequest[]; // requests parked for a not-yet-connected plugin
  lastBusyAt: number;
  lastPluginSeenAt: number; // ms of the last inbound frame/pong from the plugin
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
  const st: BrokerState = {
    pluginWs: null, pluginInfo: null, cliClients: new Set(), pending: new Map(),
    waiting: [], lastBusyAt: Date.now(), lastPluginSeenAt: 0,
  };
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

  const forwardToPlugin = (from: WebSocket, id: string, rawText: string, cmd?: string): void => {
    if (!st.pluginWs || st.pluginWs.readyState !== WebSocket.OPEN) {
      // No plugin yet. Park the request (bounded) so a just-respawned broker gives
      // the plugin's reconnect loop time to land — unless the command is exempt
      // (STATUS) or waiting is disabled. This is the fix for the respawn↔reconnect
      // race that made the first call after an idle-shutdown fail intermittently.
      if (cmd && WAIT_EXEMPT.has(cmd)) {
        sendReplyErr(from, id, 'E_NO_PLUGIN', 'no Figma plugin connected — open the figma-agent plugin in Figma');
        return;
      }
      if (PLUGIN_WAIT_TIMEOUT_MS > 0) {
        st.waiting.push({ id, from, rawText, deadline: Date.now() + PLUGIN_WAIT_TIMEOUT_MS });
        log(`parked ${id}${cmd ? ` (${cmd})` : ''} — awaiting plugin (${st.waiting.length} queued)`);
        return;
      }
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

  // Plugin just registered → flush every parked request to it (drop dead CLIs).
  const flushWaiting = (): void => {
    if (st.waiting.length === 0) return;
    const queued = st.waiting;
    st.waiting = [];
    log(`plugin connected — flushing ${queued.length} parked request(s)`);
    for (const req of queued) {
      if (req.from.readyState === WebSocket.OPEN) forwardToPlugin(req.from, req.id, req.rawText);
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
      st.waiting = st.waiting.filter((req) => req.from !== ws); // drop its parked requests
    }
  };

  const handleMessage = (ws: WebSocket, text: string): void => {
    const msg = parseWireMsg(text);
    if (!msg) return;
    // Hidden control frame from a newer CLI build replacing this broker.
    if ((msg as { type?: string }).type === 'BROKER_SHUTDOWN_REQUEST') shutdown(0, 'BROKER_SHUTDOWN_REQUEST');
    if (ws === st.pluginWs) st.lastPluginSeenAt = Date.now(); // any plugin frame = liveness
    if (isChunkMsg(msg)) {
      // Pass-through both ways — the broker never reassembles chunks.
      if (ws === st.pluginWs) routeFromPlugin(msg.id, text, msg.last);
      else forwardToPlugin(ws, msg.id, text);
    } else if (isReplyMsg(msg)) {
      if (ws === st.pluginWs) routeFromPlugin(msg.id, text, true);
    } else if (isRequestMsg(msg)) {
      forwardToPlugin(ws, msg.id, text, msg.cmd);
    } else if (isEventMsg(msg)) {
      if (msg.type === 'PLUGIN_HELLO') {
        if (st.pluginWs && st.pluginWs !== ws) st.pluginWs.terminate(); // single-plugin model
        st.cliClients.delete(ws);
        st.pluginWs = ws;
        st.pluginInfo = msg.data;
        st.lastPluginSeenAt = Date.now();
        log(`plugin registered: ${JSON.stringify(msg.data)}`);
        flushWaiting(); // deliver any requests parked during the reconnect gap
      } else if (msg.type === 'PING') {
        // App-level heartbeat from the plugin — answer so it knows the socket lives.
        if (ws === st.pluginWs) {
          try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PONG', data: { t: Date.now() } } satisfies EventMsg)); }
          catch { /* plugin vanished */ }
        }
      } else if (ws === st.pluginWs) {
        broadcastToClients(text); // FILE_INFO etc. fan out to CLI clients
      }
    }
  };

  // Single source for the greeting + `figma-agent status` broker block. Carries
  // liveness (pluginConnected, lastHeartbeatAge, state) so the CLI can report the
  // connection health without a plugin round-trip.
  const brokerHello = (): EventMsg => {
    const connected = !!st.pluginWs && st.pluginWs.readyState === WebSocket.OPEN;
    return {
      type: 'BROKER_HELLO',
      data: {
        port, pid: process.pid, protocolV: PROTOCOL_VERSION, buildMtime: selfBuildMtime(),
        uptimeMs: Date.now() - startedAt,
        pluginConnected: connected,
        pluginState: connected ? 'connected' : 'disconnected',
        lastHeartbeatAge: connected && st.lastPluginSeenAt ? Date.now() - st.lastPluginSeenAt : null,
        pluginInfo: st.pluginInfo ?? null,
      },
    };
  };

  const onConnection = (ws: WebSocket, req: import('node:http').IncomingMessage): void => {
    const tracked = ws as TrackedWs;
    tracked.isAlive = true;
    st.cliClients.add(ws); // provisional; promoted to plugin on PLUGIN_HELLO
    st.lastBusyAt = Date.now();
    log(`connection from ${req.socket.remoteAddress ?? '?'} (clients: ${st.cliClients.size})`);
    ws.on('pong', () => { tracked.isAlive = true; if (ws === st.pluginWs) st.lastPluginSeenAt = Date.now(); });
    ws.on('error', (err) => log(`ws error: ${err.message}`));
    ws.on('message', (raw) => {
      try { handleMessage(ws, rawToString(raw)); }
      catch (err) { log(`handleMessage failed: ${(err as Error).message}`); }
    });
    ws.on('close', () => handleClose(ws));
    try { ws.send(JSON.stringify(brokerHello())); } catch { /* ignore */ }
  };
  wss.on('connection', onConnection);
  wss6?.on('connection', onConnection);

  // Heartbeat: WS-ping on the heartbeat cadence; drop sockets that missed the
  // previous pong (broker→client liveness; browsers auto-pong at the WS layer).
  setInterval(() => {
    const allClients = [...wss!.clients, ...(wss6 ? wss6.clients : [])];
    for (const ws of allClients) {
      const tracked = ws as TrackedWs;
      if (tracked.isAlive === false) { log('terminating unresponsive client (missed pong)'); tracked.terminate(); continue; }
      tracked.isAlive = false;
      tracked.ping();
    }
  }, HEARTBEAT_MS);

  // Sweep parked requests: fail any that outlived their plugin-wait window, and
  // drop those whose CLI already hung up. Runs at ~4Hz relative to the window.
  setInterval(() => {
    if (st.waiting.length === 0) return;
    const now = Date.now();
    const survivors: ParkedRequest[] = [];
    for (const req of st.waiting) {
      if (req.from.readyState !== WebSocket.OPEN) continue; // CLI gone — drop silently
      if (now >= req.deadline) {
        sendReplyErr(req.from, req.id, 'E_NO_PLUGIN', 'no Figma plugin connected — open the figma-agent plugin in Figma');
      } else {
        survivors.push(req);
      }
    }
    st.waiting = survivors;
  }, Math.min(500, Math.max(100, Math.floor(PLUGIN_WAIT_TIMEOUT_MS / 8))));

  // Advertisement refresh (fixed 30s); yield if a different live broker took over.
  setInterval(() => {
    const ad = readAdvertisement();
    if (ad && ad.pid !== process.pid && isPidAlive(ad.pid)) shutdown(0, `replaced by broker pid ${ad.pid}`);
    writeAdvertisement(port, startedAt);
  }, HEARTBEAT_INTERVAL_MS);

  // Idle shutdown: no plugin AND no CLI clients for the idle window (env-overridable).
  setInterval(() => {
    if (st.pluginWs || st.cliClients.size > 0) st.lastBusyAt = Date.now();
    else if (Date.now() - st.lastBusyAt > IDLE_SHUTDOWN_MS) shutdown(0, `idle for ${IDLE_SHUTDOWN_MS}ms`);
  }, IDLE_CHECK_MS);

  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err.message}`));
}
