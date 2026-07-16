// Plugin UI entry: WebSocket client ↔ plugin-main postMessage bridge.
// Probes broker ports 9410-9419 in a FOREVER loop (exponential backoff + jitter),
// registers with PLUGIN_HELLO, runs an app-level heartbeat (PING/PONG) to detect a
// half-open socket, and drives a disconnected→probing→handshake→connected state
// machine whose transitions are posted to the UI. Relays RequestMsg → main
// (HTML_TO_FIGMA is converted here first) and replies from main → WS (chunked when
// > CHUNK_LIMIT). No Figma Plugin API — this iframe only has DOM + WebSocket +
// parent.postMessage.

// Side-effect import FIRST: the P2 panel controller attaches its conn-state /
// activity listeners at module-eval time, before this file's connectLoop fires
// its opening transition below — otherwise the panel would miss the first PROBE.
import './panel-ui';
import {
  CHUNK_LIMIT, PLUGIN_HEARTBEAT_INTERVAL_MS, PLUGIN_PONG_TIMEOUT_MS,
  PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  RECONNECT_BACKOFF_MAX_MS, RECONNECT_BACKOFF_MIN_MS,
  makeStatePayload, nextBackoff, reduceConnState,
  type ChunkMsg, type CommandName, type ConnectionEvent, type ConnectionState, type ConnectionStatePayload,
  type ErrorCode, type ReplyMsg, type RequestMsg,
} from '../../../shared/protocol';
import { renderHtmlToPayload } from './render-host';

const PLUGIN_VERSION = '0.1.0';
const PORT_PROBE_TIMEOUT_MS = 1200; // a real broker greets in <50ms; short = fast scan
const BACKOFF_OPTS = { minMs: RECONNECT_BACKOFF_MIN_MS, maxMs: RECONNECT_BACKOFF_MAX_MS };

// Stable per-instance id, minted ONCE per iframe load and carried in every
// PLUGIN_HELLO. It lets the broker keep this file in its own registry slot and
// recognise a reconnect as the SAME instance (update, not a duplicate) — the
// backbone of running two Figma files at once without them evicting each other.
const INSTANCE_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

let ws: WebSocket | null = null;
let backoffBase = 0; // grows via nextBackoff; reset to 0 (→ min) on a successful connect
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastPongAt = 0;
let connState: ConnectionState = 'disconnected';
let fileInfo: Record<string, unknown> = {}; // FILE_INFO from main (fileName, fileKey…)
const chunkBuffers = new Map<string, string[]>(); // requestId → chunk slices

// ─── Activity telemetry → UI (P2) ───────────────────────────────────────────
// Each request that reaches handleRequest is timed; on completion the relay
// dispatches a `figma-agent:activity` {tool, ok, ms, at} CustomEvent that the P2
// panel renders in its activity log. Lives here (not in main) because the relay
// owns the request lifecycle on the UI side — same place conn-state is emitted.
const activityStart = new Map<string, { cmd: CommandName; at: number }>();

function emitActivity(id: string, ok: boolean): void {
  const started = activityStart.get(id);
  if (!started) return;
  activityStart.delete(id);
  const detail = { tool: started.cmd, ok, ms: Date.now() - started.at, at: started.at };
  try { window.dispatchEvent(new CustomEvent('figma-agent:activity', { detail })); } catch { /* no DOM event support */ }
}

// ─── Connection state machine → UI ──────────────────────────────────
// Every transition posts a ConnectionStatePayload as the `figma-agent:conn-state`
// CustomEvent (the P2 panel redesign consumes exactly this shape) AND updates the
// current minimal status DOM so P1 is usable before P2 lands.
function renderStatusDom(p: ConnectionStatePayload): void {
  const statusEl = document.getElementById('status');
  const detailEl = document.getElementById('detail');
  const label: Record<ConnectionState, { text: string; cls: string }> = {
    disconnected: { text: 'disconnected', cls: 'err' },
    probing: { text: 'searching for broker…', cls: '' },
    handshake: { text: 'connecting…', cls: '' },
    connected: { text: 'connected', cls: 'ok' },
  };
  const { text, cls } = label[p.state];
  if (statusEl) {
    statusEl.textContent = `figma-agent: ${text}`;
    statusEl.className = cls;
  }
  if (detailEl) detailEl.textContent = p.detail ?? '';
}

function transition(event: ConnectionEvent, extra: Partial<ConnectionStatePayload> = {}): void {
  connState = reduceConnState(connState, event);
  const payload = makeStatePayload(connState, { since: Date.now(), ...extra });
  renderStatusDom(payload);
  try { window.dispatchEvent(new CustomEvent('figma-agent:conn-state', { detail: payload })); } catch { /* no DOM event support */ }
}

/** Ad-hoc status text within a state (e.g. HTML render progress) — no transition. */
function setStatusText(text: string, cls: '' | 'ok' | 'err' = ''): void {
  const statusEl = document.getElementById('status');
  if (statusEl) { statusEl.textContent = `figma-agent: ${text}`; statusEl.className = cls; }
}

// ─── Outbound WS (with chunking for big replies) ────────────────────
function wsSend(msg: ReplyMsg | { type: string; data: Record<string, unknown> }): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const json = JSON.stringify(msg);
  if (json.length <= CHUNK_LIMIT || !('id' in msg)) {
    ws.send(json);
    return;
  }
  const total = Math.ceil(json.length / CHUNK_LIMIT);
  for (let seq = 0; seq < total; seq++) {
    const chunk: ChunkMsg = {
      id: (msg as ReplyMsg).id,
      seq,
      last: seq === total - 1,
      chunk: json.slice(seq * CHUNK_LIMIT, (seq + 1) * CHUNK_LIMIT),
    };
    ws.send(JSON.stringify(chunk));
  }
}

function sendErr(id: string, code: ErrorCode, message: string): void {
  wsSend({ id, ok: false, error: { code, message } });
}

// ─── Inbound WS: chunk reassembly + routing ─────────────────────────
function handleWireData(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // malformed frame — ignore
  }
  if (msg.type === 'PONG') { lastPongAt = Date.now(); return; } // heartbeat ack
  // Live-sync (spec 004 P4). SYNC_CONFIG → main's idle timer; SYNC_RESULT → the panel.
  if (msg.type === 'SYNC_CONFIG') {
    parent.postMessage({ pluginMessage: { type: 'SYNC_CONFIG', data: msg.data ?? {} } }, '*');
    return;
  }
  if (msg.type === 'SYNC_RESULT') {
    try { window.dispatchEvent(new CustomEvent('figma-agent:sync-result', { detail: msg.data ?? {} })); }
    catch { /* no DOM event support */ }
    return;
  }
  if (typeof msg.chunk === 'string' && typeof msg.seq === 'number' && typeof msg.id === 'string') {
    handleChunk(msg as unknown as ChunkMsg);
    return;
  }
  if (typeof msg.cmd === 'string' && typeof msg.id === 'string') {
    void handleRequest(msg as unknown as RequestMsg);
  }
  // Events (BROKER_HELLO rebroadcasts etc.) need no action here
}

function handleChunk(c: ChunkMsg): void {
  let buf = chunkBuffers.get(c.id);
  if (!buf) {
    buf = [];
    chunkBuffers.set(c.id, buf);
  }
  buf[c.seq] = c.chunk;
  if (!c.last) return;
  chunkBuffers.delete(c.id);
  for (let i = 0; i <= c.seq; i++) {
    if (buf[i] === undefined) {
      sendErr(c.id, 'E_CHUNK_LOST', `missing chunk ${i} of ${c.seq + 1}`);
      return;
    }
  }
  handleWireData(buf.join(''));
}

// ─── Request routing: HTML_TO_FIGMA converts here, rest passes to main ──
interface HtmlToFigmaParams {
  html?: string; width?: number; name?: string;
  x?: number; y?: number; parentId?: string; replaceId?: string;
}

async function handleRequest(req: RequestMsg): Promise<void> {
  activityStart.set(req.id, { cmd: req.cmd, at: Date.now() }); // timed until completion
  try {
    if (req.cmd === 'HTML_TO_FIGMA') {
      const p = (req.params ?? {}) as HtmlToFigmaParams;
      if (!p.html) {
        sendErr(req.id, 'E_INVALID_ARGS', 'HTML_TO_FIGMA requires params.html');
        emitActivity(req.id, false);
        return;
      }
      setStatusText('rendering html…', 'ok');
      const payload = await renderHtmlToPayload(p.html, p.width ?? 1280, p.name ?? 'HTML Import');
      setStatusText('connected', 'ok');
      parent.postMessage({
        pluginMessage: {
          requestId: req.id,
          cmd: 'IMPORT_PAYLOAD',
          params: { payload, x: p.x, y: p.y, parentId: p.parentId, replaceId: p.replaceId },
        },
      }, '*');
    } else {
      // Everything else is a main-thread op — forward unchanged
      parent.postMessage({ pluginMessage: { requestId: req.id, cmd: req.cmd, params: req.params } }, '*');
    }
  } catch (err) {
    setStatusText('connected', 'ok');
    sendErr(req.id, 'E_PLUGIN_ERROR', err instanceof Error ? err.message : String(err));
    emitActivity(req.id, false);
  }
}

// ─── Replies + events from plugin main thread ───────────────────────
window.addEventListener('message', (ev: MessageEvent) => {
  const pm = (ev.data as { pluginMessage?: Record<string, unknown> } | null)?.pluginMessage;
  if (!pm) return;

  // Main announces file identity on startup (figma.* not readable in iframe)
  if (pm.type === 'FILE_INFO') {
    fileInfo = (pm.data as Record<string, unknown>) ?? {};
    wsSend({ type: 'FILE_INFO', data: fileInfo });
    return;
  }

  // Live-sync capture (spec 004 P1): main's coalesced documentchange batch →
  // straight over the wire so the broker can append it to the change log.
  if (pm.type === 'DOC_CHANGE') {
    wsSend({ type: 'DOC_CHANGE', data: (pm.data as Record<string, unknown>) ?? {} });
    return;
  }

  // Command reply from main → back over the wire
  if (typeof pm.requestId === 'string') {
    const reply: ReplyMsg = pm.ok
      ? { id: pm.requestId, ok: true, result: pm.result }
      : {
          id: pm.requestId,
          ok: false,
          error: (pm.error as { code: ErrorCode; message: string } | undefined)
            ?? { code: 'E_PLUGIN_ERROR', message: 'main thread returned no error detail' },
        };
    wsSend(reply);
    emitActivity(pm.requestId, pm.ok === true); // request round-trip completed
  }
});

// ─── App-level heartbeat: PING the broker, reconnect on a missed PONG ─
function stopHeartbeat(): void {
  if (heartbeatTimer !== null) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(socket: WebSocket): void {
  stopHeartbeat();
  lastPongAt = Date.now();
  heartbeatTimer = setInterval(() => {
    if (ws !== socket) { stopHeartbeat(); return; }
    if (Date.now() - lastPongAt > PLUGIN_PONG_TIMEOUT_MS) {
      teardown(socket, 'heartbeat lost — reconnecting…'); // half-open socket → recover
      return;
    }
    try { socket.send(JSON.stringify({ type: 'PING', data: { t: Date.now() } })); }
    catch { teardown(socket, 'ping failed — reconnecting…'); }
  }, PLUGIN_HEARTBEAT_INTERVAL_MS);
}

/** Tear one socket down once, then re-enter the reconnect loop. Idempotent per socket. */
function teardown(socket: WebSocket, reason: string): void {
  if (ws !== socket) return; // already replaced / torn down
  ws = null;
  stopHeartbeat();
  transition('LOST', { detail: reason });
  try {
    socket.onclose = null; socket.onerror = null; socket.onmessage = null;
    socket.close();
  } catch { /* already closed */ }
  scheduleReconnect();
}

// ─── Broker discovery: probe each port until BROKER_HELLO ───────────
// The broker binds 127.0.0.1 (IPv4). Chromium may resolve `localhost` to ::1
// (IPv6) first, which refuses — so the broker listens on both loopback families
// and we probe ws://localhost:PORT (allowedDomains accepts only hostnames).
function probePort(port: number, host: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://${host}:${port}`);
    } catch {
      resolve(null);
      return;
    }
    const finish = (result: WebSocket | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!result) {
        try { socket.close(); } catch { /* already closed */ }
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), PORT_PROBE_TIMEOUT_MS);
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg?.type === 'BROKER_HELLO') finish(socket);
      } catch { /* not the greeting — keep waiting until timeout */ }
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

async function scanForBroker(): Promise<WebSocket | null> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    transition('PROBE', { detail: `probing localhost:${port}…`, port });
    const socket = await probePort(port, 'localhost');
    if (socket) return socket;
  }
  return null;
}

function adoptSocket(socket: WebSocket): void {
  ws = socket;
  backoffBase = 0; // reset backoff on a live connection
  chunkBuffers.clear();
  const url = socket.url.replace(/\/$/, '');
  const portMatch = /:(\d+)/.exec(url);
  const port = portMatch ? Number(portMatch[1]) : undefined;

  transition('FOUND', { detail: `broker at ${url}`, brokerUrl: url, port });
  socket.onmessage = (ev) => handleWireData(String(ev.data));
  socket.onerror = () => { /* onclose fires next and drives the reconnect */ };
  socket.onclose = () => teardown(socket, 'broker connection lost — reconnecting…');

  // Register plugin identity (fileName merged in once main sends FILE_INFO).
  // instanceId is stable across reconnects so the broker updates this file's slot
  // instead of spawning a duplicate.
  wsSend({ type: 'PLUGIN_HELLO', data: { ...fileInfo, instanceId: INSTANCE_ID, pluginVersion: PLUGIN_VERSION, protocolV: PROTOCOL_VERSION } });
  startHeartbeat(socket);
  transition('READY', { detail: `broker at ${url} · protocol v${PROTOCOL_VERSION}`, brokerUrl: url, port });
}

function scheduleReconnect(): void {
  const { base, delay } = nextBackoff(backoffBase, BACKOFF_OPTS);
  backoffBase = base;
  setTimeout(() => void connectLoop(), delay);
}

async function connectLoop(): Promise<void> {
  try {
    const socket = await scanForBroker();
    if (!socket) {
      transition('PROBE', {
        detail: `no broker on :${PORT_RANGE_START}-${PORT_RANGE_END} — is a CLI command running? retrying…`,
      });
      scheduleReconnect();
      return;
    }
    adoptSocket(socket);
  } catch (err) {
    transition('LOST', { detail: err instanceof Error ? err.message : String(err) });
    scheduleReconnect();
  }
}

// Live-sync (spec 004 P4): the panel's "Sync now" click dispatches this DOM event;
// forward it to the broker as SYNC_REQUEST (the broker then runs `ui figma reconcile
// --apply`). Same-iframe hop — panel-ui.ts owns the button, this owns the socket.
window.addEventListener('figma-agent:sync-request', () => {
  wsSend({ type: 'SYNC_REQUEST', data: {} });
});

void connectLoop();
