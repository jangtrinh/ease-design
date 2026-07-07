// Plugin UI entry: WebSocket client ↔ plugin-main postMessage bridge.
// Scans broker ports 9410-9419 until BROKER_HELLO, registers with PLUGIN_HELLO,
// then relays RequestMsg → main (HTML_TO_FIGMA is converted here first) and
// replies from main → WS (chunked when > CHUNK_LIMIT). No Figma Plugin API —
// this iframe only has DOM + WebSocket + parent.postMessage.

import {
  CHUNK_LIMIT, PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type ChunkMsg, type ErrorCode, type ReplyMsg, type RequestMsg,
} from '../../../shared/protocol';
import { renderHtmlToPayload } from './render-host';

const PLUGIN_VERSION = '0.1.0';
const PORT_PROBE_TIMEOUT_MS = 2500;
const RECONNECT_BACKOFF_MAX_MS = 15_000;

let ws: WebSocket | null = null;
let reconnectBackoffMs = 1000;
let fileInfo: Record<string, unknown> = {}; // FILE_INFO from main (fileName, fileKey…)
const chunkBuffers = new Map<string, string[]>(); // requestId → chunk slices

// ─── Status badge ───────────────────────────────────────────────────
function setStatus(text: string, cls: '' | 'ok' | 'err' = '', detail = ''): void {
  const statusEl = document.getElementById('status');
  const detailEl = document.getElementById('detail');
  if (statusEl) {
    statusEl.textContent = `figma-agent: ${text}`;
    statusEl.className = cls;
  }
  if (detailEl) detailEl.textContent = detail;
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
  try {
    if (req.cmd === 'HTML_TO_FIGMA') {
      const p = (req.params ?? {}) as HtmlToFigmaParams;
      if (!p.html) {
        sendErr(req.id, 'E_INVALID_ARGS', 'HTML_TO_FIGMA requires params.html');
        return;
      }
      setStatus('connected — rendering html…', 'ok');
      const payload = await renderHtmlToPayload(p.html, p.width ?? 1280, p.name ?? 'HTML Import');
      setStatus('connected', 'ok');
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
    setStatus('connected', 'ok');
    sendErr(req.id, 'E_PLUGIN_ERROR', err instanceof Error ? err.message : String(err));
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
  }
});

// ─── Broker discovery: probe each port until BROKER_HELLO ───────────
// The broker binds 127.0.0.1 (IPv4). Chromium may resolve `localhost` to ::1
// (IPv6) first, which refuses — so probe the explicit IPv4 host, then localhost.
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

// Evidence-based (southleft production manifest + Figma docs): allowedDomains
// accepts ONLY hostnames (localhost), never IPs — and each non-80 port must be
// listed explicitly. So we probe ws://localhost:PORT only; the broker listens on
// both loopback families so whichever way Chromium resolves `localhost` works.
async function scanForBroker(): Promise<WebSocket | null> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    setStatus(`searching broker on localhost:${port}…`);
    const socket = await probePort(port, 'localhost');
    if (socket) return socket;
  }
  return null;
}

function adoptSocket(socket: WebSocket): void {
  ws = socket;
  reconnectBackoffMs = 1000;
  chunkBuffers.clear();
  socket.onmessage = (ev) => handleWireData(String(ev.data));
  socket.onerror = () => { /* onclose fires next and drives the reconnect */ };
  socket.onclose = () => {
    ws = null;
    setStatus('broker connection lost — reconnecting…', 'err');
    scheduleReconnect();
  };
  // Register plugin identity (fileName merged in once main sends FILE_INFO)
  wsSend({ type: 'PLUGIN_HELLO', data: { ...fileInfo, pluginVersion: PLUGIN_VERSION, protocolV: PROTOCOL_VERSION } });
  const url = socket.url.replace(/\/$/, '');
  setStatus('connected', 'ok', `broker at ${url} · protocol v${PROTOCOL_VERSION}`);
}

function scheduleReconnect(): void {
  setTimeout(() => void connectLoop(), reconnectBackoffMs);
  reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, RECONNECT_BACKOFF_MAX_MS);
}

async function connectLoop(): Promise<void> {
  try {
    const socket = await scanForBroker();
    if (!socket) {
      setStatus(`no broker on :${PORT_RANGE_START}-${PORT_RANGE_END} — retrying…`, 'err',
        'start one with: figma-agent status');
      scheduleReconnect();
      return;
    }
    adoptSocket(socket);
  } catch (err) {
    setStatus('relay error — retrying…', 'err', err instanceof Error ? err.message : String(err));
    scheduleReconnect();
  }
}

void connectLoop();
