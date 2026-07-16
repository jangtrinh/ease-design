// Persistent WS broker daemon (`figma-agent __broker`): binds the first free
// port in 9410-9419, advertises itself in /tmp, and relays request/reply frames
// between the connected Figma plugins and ephemeral CLI clients (pure relay —
// never interprets `cmd`). Holds a multi-plugin registry (one slot per open file,
// keyed by instanceId) so two files never evict each other; routes each command to
// the most-recently-active file (or the FIGMA_AGENT_FILE-matched one). Design: a
// persistent broker-daemon pattern (one long-lived relay process, hot-swappable
// across CLI rebuilds), adapted from southleft/figma-console-mcp's websocket-server
// pending-request correlation (347-360) / heartbeat (672-685).
import { appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import WebSocket, { WebSocketServer } from 'ws';
import {
  BROKER_FILE, BROKER_IDLE_SHUTDOWN_MS, HEARTBEAT_INTERVAL_MS, PLUGIN_WAIT_MS,
  PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type BrokerAdvertisement, type ErrorCode, type EventMsg, type ReplyErr,
} from '../../../shared/protocol.ts';
import { isPidAlive, readAdvertisement, selfBuildMtime, writeAdvertisement } from './broker-discovery.ts';
import { isChunkMsg, isEventMsg, isReplyMsg, isRequestMsg, parseWireMsg, rawToString } from './protocol-helpers.ts';
import { PluginRegistry } from './plugin-registry.ts';
import { buildBrokerHelloData, noPluginMessage } from './broker-status.ts';
import { appendChangeFrames, changeLogPath } from './change-log.ts';
import { projectDir as syncProjectDir, readIdleMs } from './figma-sync-config.ts';
import { spawnReconcileApply } from './figma-sync-apply.ts';
import type { ComponentChange } from '../../../shared/figma-changes.ts';

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

/** Optional routing pin: only route to a plugin whose fileName matches (case-
 *  insensitive substring). Read per-call so it reflects the broker's env. */
function currentFilter(): string | null {
  const raw = process.env.FIGMA_AGENT_FILE?.trim();
  return raw ? raw : null;
}

type TrackedWs = WebSocket & { isAlive?: boolean };

/** A request parked until a plugin (re)connects or the wait window elapses. */
interface ParkedRequest {
  id: string;
  from: WebSocket;
  rawText: string;
  deadline: number;
}

interface BrokerState {
  registry: PluginRegistry<WebSocket>; // one slot per connected plugin instance
  cliClients: Set<WebSocket>;
  pending: Map<string, WebSocket>; // request id → CLI client awaiting the reply
  dispatchedTo: Map<string, WebSocket>; // request id → plugin ws (pins chunk streams to ONE plugin)
  waiting: ParkedRequest[]; // requests parked for a not-yet-connected plugin
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

/**
 * Extract a DOC_CHANGE batch's fields and append every frame to the change log.
 * Best-effort: malformed data or an fs error is swallowed (logged) — capture must
 * never break the relay. `ts` is stamped here (broker append time), near-real-time.
 */
function appendDocChange(changesPath: string, data: Record<string, unknown>): void {
  try {
    const changes = Array.isArray(data.changes) ? (data.changes as ComponentChange[]) : [];
    if (changes.length === 0) return;
    const page = typeof data.page === 'string' ? data.page : '';
    const fileKey = typeof data.fileKey === 'string' ? data.fileKey : null;
    const written = appendChangeFrames(changesPath, changes, { page, fileKey }, Date.now());
    if (written > 0) log(`DOC_CHANGE: appended ${written} change frame(s) → ${changesPath}`);
  } catch (err) {
    log(`DOC_CHANGE append failed: ${(err as Error).message}`);
  }
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
    registry: new PluginRegistry<WebSocket>(), cliClients: new Set(), pending: new Map(),
    dispatchedTo: new Map(), waiting: [], lastBusyAt: Date.now(),
  };
  writeAdvertisement(port, startedAt);
  log(`broker listening on 127.0.0.1:${port}${wss6 ? ' + [::1]:' + port : ''}`);

  // Live-sync change log (spec 004 P1): resolved once from the broker's cwd (or
  // FIGMA_AGENT_CHANGES_DIR). Each DOC_CHANGE batch is appended here; reconcile
  // (P2/P4) walks it. Path fixed for the daemon's life — cwd never changes.
  const changesPath = changeLogPath();

  // Live-sync idle-commit (spec 004 P4): the idle window sent to each plugin, and a
  // debounce so a double-click never launches two overlapping `ui figma reconcile
  // --apply` processes.
  const idleMs = readIdleMs();
  const applyProjectDir = syncProjectDir();
  let syncInFlight = false;

  /** Send one unsolicited EventMsg to a single socket (best-effort). */
  const sendEvent = (ws: WebSocket, type: EventMsg['type'], data: Record<string, unknown>): void => {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data } satisfies EventMsg)); }
    catch { /* socket already gone */ }
  };

  // SYNC_REQUEST → run the deterministic kernel apply, then report SYNC_RESULT back to
  // the requesting plugin. Registry-write logic stays in `ui` (Art I) — the broker only
  // spawns it. Debounced: a click mid-apply is ignored (the panel just waits).
  const handleSyncRequest = (ws: WebSocket): void => {
    if (syncInFlight) { sendEvent(ws, 'SYNC_RESULT', { ok: false, summary: 'a sync is already running' }); return; }
    syncInFlight = true;
    log(`SYNC_REQUEST → spawning: ui figma reconcile --apply --dir ${applyProjectDir}`);
    spawnReconcileApply(applyProjectDir, (r) => {
      syncInFlight = false;
      log(`SYNC_RESULT ok=${r.ok} — ${r.summary}`);
      sendEvent(ws, 'SYNC_RESULT', { ...r });
    });
  };

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
    const filter = currentFilter();
    // Pin a multi-chunk request to the plugin its first frame went to: selecting
    // "most-recent" per chunk could split one payload across two files.
    let targetWs = st.dispatchedTo.get(id);
    if (targetWs && targetWs.readyState !== WebSocket.OPEN) targetWs = undefined;
    if (!targetWs) targetWs = st.registry.selectTarget(filter)?.ws;

    if (!targetWs) {
      // No (matching) plugin. Park the request (bounded) so a just-respawned broker
      // gives the plugin's reconnect loop time to land — unless the command is exempt
      // (STATUS) or waiting is disabled. With a filter set, park until a MATCHING
      // plugin appears (same wait window). Fixes the respawn↔reconnect race AND lets
      // a pinned file connect after the command was issued.
      const parkable = !(cmd && WAIT_EXEMPT.has(cmd)) && PLUGIN_WAIT_TIMEOUT_MS > 0;
      if (!parkable) {
        sendReplyErr(from, id, 'E_NO_PLUGIN', noPluginMessage(st.registry, filter));
        return;
      }
      st.waiting.push({ id, from, rawText, deadline: Date.now() + PLUGIN_WAIT_TIMEOUT_MS });
      log(`parked ${id}${cmd ? ` (${cmd})` : ''}${filter ? ` [filter="${filter}"]` : ''} — awaiting ${filter ? 'matching ' : ''}plugin (${st.waiting.length} queued)`);
      return;
    }
    st.pending.set(id, from);
    st.dispatchedTo.set(id, targetWs);
    try { targetWs.send(rawText); }
    catch (err) {
      st.pending.delete(id);
      st.dispatchedTo.delete(id);
      sendReplyErr(from, id, 'E_PLUGIN_ERROR', `relay to plugin failed: ${(err as Error).message}`);
    }
  };

  // A plugin (re)registered → try to flush parked requests. Only forward a request
  // once a target exists (matching the filter, if any); otherwise re-park it with
  // its ORIGINAL deadline so a non-matching HELLO never extends the wait window.
  const flushWaiting = (): void => {
    if (st.waiting.length === 0) return;
    const queued = st.waiting;
    st.waiting = [];
    let delivered = 0;
    for (const req of queued) {
      if (req.from.readyState !== WebSocket.OPEN) continue; // CLI gone — drop silently
      if (st.registry.selectTarget(currentFilter())) {
        forwardToPlugin(req.from, req.id, req.rawText);
        delivered++;
      } else {
        st.waiting.push(req); // still no matching plugin — keep parked, deadline intact
      }
    }
    if (delivered > 0) log(`flushed ${delivered} parked request(s)`);
  };

  const routeFromPlugin = (id: string, rawText: string, final: boolean): void => {
    const client = st.pending.get(id);
    if (!client) return;
    try { if (client.readyState === WebSocket.OPEN) client.send(rawText); }
    catch { /* requester vanished */ }
    if (final) { st.pending.delete(id); st.dispatchedTo.delete(id); }
  };

  const handleClose = (ws: WebSocket): void => {
    // Fail only the in-flight requests routed to THIS socket (a plugin, or a
    // superseded orphan) — other plugins' requests are untouched.
    for (const [id, target] of st.dispatchedTo) {
      if (target !== ws) continue;
      const client = st.pending.get(id);
      if (client) sendReplyErr(client, id, 'E_NO_PLUGIN', 'Figma plugin disconnected mid-request');
      st.pending.delete(id);
      st.dispatchedTo.delete(id);
    }
    const removedId = st.registry.removeByWs(ws);
    if (removedId !== null) {
      const remaining = st.registry.size();
      log(`plugin [${removedId}] disconnected (${remaining} still connected)`);
      // Only announce PLUGIN_GONE when the LAST plugin leaves — a CLI waiting on a
      // still-connected file must not be told the bridge is gone.
      if (remaining === 0) broadcastToClients(JSON.stringify({ type: 'PLUGIN_GONE', data: {} } satisfies EventMsg));
      return;
    }
    // A CLI client.
    st.cliClients.delete(ws);
    for (const [id, client] of st.pending) if (client === ws) { st.pending.delete(id); st.dispatchedTo.delete(id); }
    st.waiting = st.waiting.filter((req) => req.from !== ws); // drop its parked requests
  };

  const handleMessage = (ws: WebSocket, text: string): void => {
    const msg = parseWireMsg(text);
    if (!msg) return;
    // Hidden control frame from a newer CLI build replacing this broker.
    if ((msg as { type?: string }).type === 'BROKER_SHUTDOWN_REQUEST') shutdown(0, 'BROKER_SHUTDOWN_REQUEST');
    const isPlugin = st.registry.touch(ws); // any plugin frame = LIVENESS (heartbeat cull)
    if (isChunkMsg(msg)) {
      // Pass-through both ways — the broker never reassembles chunks.
      if (isPlugin) { st.registry.touchActive(ws); routeFromPlugin(msg.id, text, msg.last); }
      else forwardToPlugin(ws, msg.id, text);
    } else if (isReplyMsg(msg)) {
      if (isPlugin) { st.registry.touchActive(ws); routeFromPlugin(msg.id, text, true); }
    } else if (isRequestMsg(msg)) {
      forwardToPlugin(ws, msg.id, text, msg.cmd);
    } else if (isEventMsg(msg)) {
      if (msg.type === 'PLUGIN_HELLO') {
        // Multi-plugin: register this instance in its OWN slot — never evict another
        // file's plugin (the connect/disconnect flapping bug). A same-instance
        // reconnect supersedes its own stale socket, which we close here.
        st.cliClients.delete(ws);
        const { instanceId, replaced, superseded } = st.registry.register(ws, msg.data);
        if (superseded) { try { superseded.close(); } catch { /* already gone */ } }
        st.lastBusyAt = Date.now();
        log(`plugin registered [${instanceId}]${replaced ? ' (replaced — same instance re-hello)' : ''}: ${JSON.stringify(msg.data)}`);
        // Live-sync (spec 004 P4): hand this plugin the idle window so its debounce
        // timer matches the project's design/figma-sync.json.
        sendEvent(ws, 'SYNC_CONFIG', { idleMs });
        flushWaiting(); // deliver any requests parked during the reconnect gap
      } else if (msg.type === 'PING') {
        // App-level heartbeat from the plugin — answer so it knows the socket lives.
        if (isPlugin) {
          try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PONG', data: { t: Date.now() } } satisfies EventMsg)); }
          catch { /* plugin vanished */ }
        }
      } else if (msg.type === 'FILE_INFO') {
        if (isPlugin) { st.registry.updateScene(ws, msg.data); broadcastToClients(text); } // page change → refresh scene + fan out
      } else if (msg.type === 'DOC_CHANGE') {
        // Live-sync capture: append the plugin's coalesced batch to the change log.
        // Broker-side append (not CLI) because the broker is the long-lived process —
        // it catches edits even when no CLI command is running. Best-effort: a log
        // write failure must never disrupt the relay.
        if (isPlugin) appendDocChange(changesPath, msg.data);
      } else if (msg.type === 'SYNC_REQUEST') {
        // Live-sync commit (spec 004 P4): the panel's "Sync now" click → run the
        // deterministic kernel apply and report the result back to this plugin.
        if (isPlugin) handleSyncRequest(ws);
      } else if (isPlugin) {
        broadcastToClients(text); // other plugin events fan out to CLI clients
      }
    }
  };

  // Single source for the greeting + `figma-agent status` broker block. Carries
  // the full plugins[] list + activePlugin AND a legacy single-plugin mirror
  // (pluginConnected/state/lastHeartbeatAge/pluginInfo of the ACTIVE plugin) so
  // the CLI reports connection health — and older consumers keep working — with
  // no plugin round-trip. See broker-status.ts for the compat-shim rationale.
  const brokerHello = (): EventMsg => ({
    type: 'BROKER_HELLO',
    data: buildBrokerHelloData(
      st.registry,
      { port, pid: process.pid, protocolV: PROTOCOL_VERSION, buildMtime: selfBuildMtime(), uptimeMs: Date.now() - startedAt },
      currentFilter(),
    ),
  });

  const onConnection = (ws: WebSocket, req: import('node:http').IncomingMessage): void => {
    const tracked = ws as TrackedWs;
    tracked.isAlive = true;
    st.cliClients.add(ws); // provisional; promoted to plugin on PLUGIN_HELLO
    st.lastBusyAt = Date.now();
    log(`connection from ${req.socket.remoteAddress ?? '?'} (clients: ${st.cliClients.size})`);
    ws.on('pong', () => { tracked.isAlive = true; st.registry.touch(ws); }); // pong from a plugin bumps its liveness
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
        // Same filter-aware message as the immediate-fail path: names FIGMA_AGENT_FILE
        // and lists connected files when a pin matched nothing in the wait window.
        sendReplyErr(req.from, req.id, 'E_NO_PLUGIN', noPluginMessage(st.registry, currentFilter()));
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
    if (st.registry.size() > 0 || st.cliClients.size > 0) st.lastBusyAt = Date.now();
    else if (Date.now() - st.lastBusyAt > IDLE_SHUTDOWN_MS) shutdown(0, `idle for ${IDLE_SHUTDOWN_MS}ms`);
  }, IDLE_CHECK_MS);

  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err.message}`));
}
