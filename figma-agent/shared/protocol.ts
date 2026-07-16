// Wire protocol v1 — shared by cli/ (broker + client) and plugin/ (ui-relay).
// Spec: docs/phase-1-implementation-plan.md §2. Both bundles import this file
// relatively; esbuild inlines it per bundle.

export const PROTOCOL_VERSION = 1;

// Broker binds the first free port in this range (broker model: ONE daemon owns
// the port; plugin + every CLI invocation connect as WS clients).
export const PORT_RANGE_START = 9410;
export const PORT_RANGE_END = 9419;

// Discovery advertisement file (refreshed every 30s by the broker).
export const BROKER_FILE = '/tmp/figma-agent-broker.json';

export interface BrokerAdvertisement {
  port: number;
  pid: number;
  protocolV: number;
  buildMtime: number; // newer CLI build replaces a stale broker
  startedAt: number;
  lastSeen: number;
}

// ── Command names (wire `cmd` strings) ─────────────────────────────
export const COMMANDS = [
  'STATUS',
  'GET_SELECTION',
  'SCAN_DESIGN_SYSTEM',
  'AUDIT_DS',
  'CREATE_FRAME',
  'CREATE_INSTANCE',
  'SET_VARIANT',
  'CREATE_VARIABLE',
  'BIND_VARIABLE',
  'SET_AUTOLAYOUT',
  'SET_CONSTRAINTS',
  'SET_TEXT',
  'EXPORT_PNG',
  'HTML_TO_FIGMA', // handled by ui-relay (render → payload) then IMPORT_PAYLOAD to main
  'IMPORT_PAYLOAD', // internal: ui → main with FigmaExportPayload
  'EXEC_JS',
  'BATCH',
] as const;
export type CommandName = (typeof COMMANDS)[number];

// ── Envelopes ───────────────────────────────────────────────────────
export interface RequestMsg {
  id: string; // `c_<counter>_<ts>` (CLI-generated)
  cmd: CommandName;
  params: unknown;
  v: number; // PROTOCOL_VERSION
}

export interface ReplyOk {
  id: string;
  ok: true;
  result: unknown;
}

export interface ReplyErr {
  id: string;
  ok: false;
  error: { code: ErrorCode; message: string };
}
export type ReplyMsg = ReplyOk | ReplyErr;

// Unsolicited broadcasts (no `id`).
// PING/PONG are the APPLICATION-level heartbeat: the plugin iframe runs a browser
// WebSocket, whose API does NOT expose protocol-level ping() to JS — so the plugin
// cannot detect a half-open socket via WS control frames. It sends {type:'PING'}
// JSON frames and the broker answers {type:'PONG'}; a missed PONG ⇒ socket dead.
export interface EventMsg {
  // DOC_CHANGE (spec 004 P1): the plugin's coalesced documentchange batch, carried
  // plugin → broker; the broker appends it to design/figma.changes.jsonl. Payload
  // shape: { changes: ComponentChange[], page: string, fileKey: string|null }.
  //
  // Live-sync idle-commit (spec 004 P4) adds three wire events:
  //   SYNC_CONFIG   broker → plugin: the idle window { idleMs } for this project's
  //                 design/figma-sync.json (sent right after PLUGIN_HELLO).
  //   SYNC_REQUEST  plugin → broker: the panel's "Sync now" click; the broker spawns
  //                 `ui figma reconcile --apply` (apply stays in the deterministic kernel).
  //   SYNC_RESULT   broker → plugin: { ok, summary } of that apply, for the panel to confirm.
  // (IDLE_READY / SYNC_DONE are plugin-INTERNAL postMessage types between the main
  // thread and its iframe — they never cross this wire, so they are not listed here.)
  type:
    | 'BROKER_HELLO' | 'PLUGIN_HELLO' | 'FILE_INFO' | 'PLUGIN_GONE' | 'PING' | 'PONG'
    | 'DOC_CHANGE' | 'SYNC_CONFIG' | 'SYNC_REQUEST' | 'SYNC_RESULT';
  data: Record<string, unknown>;
}

// Default idle window (ms) before the plugin prompts to sync — 5 minutes (spec 004).
// Overridable per-project in design/figma-sync.json {"idleMs": N} (or the broker's
// FIGMA_AGENT_IDLE_MS env for fast manual testing). The plugin clamps to a floor.
export const DEFAULT_IDLE_MS = 300_000;
export const MIN_IDLE_MS = 1_000;

// ── Multi-plugin registry (P4) ──────────────────────────────────────
// A plugin instance's scene identity, carried on PLUGIN_HELLO and grown by
// FILE_INFO. Two Figma files open at once each keep their own scene + slot.
export interface PluginScene {
  fileName?: string;
  page?: string;
  [k: string]: unknown;
}

// One row of the `figma-agent status` plugins[] list (one per connected file).
export interface PluginStatusEntry {
  instanceId: string;
  fileName: string | null;
  page: string | null;
  state: 'connected';
  lastHeartbeatAge: number | null; // ms since the last frame/pong from this instance
  connectedAt: number; // ms epoch of this instance's first HELLO
}

// Chunked transport for payloads > CHUNK_LIMIT (both directions).
export interface ChunkMsg {
  id: string;
  seq: number;
  last: boolean;
  chunk: string; // slice of the JSON.stringify'd full message
}
export const CHUNK_LIMIT = 512 * 1024;

export type WireMsg = RequestMsg | ReplyMsg | EventMsg | ChunkMsg;

// ── Errors ──────────────────────────────────────────────────────────
export type ErrorCode =
  | 'E_NO_BROKER'
  | 'E_NO_PLUGIN'
  | 'E_TIMEOUT'
  | 'E_INVALID_ARGS'
  | 'E_PLUGIN_ERROR'
  | 'E_EVAL'
  | 'E_VERSION_MISMATCH'
  | 'E_CHUNK_LOST'
  // audit-ds v2: captured facts carry a `schema`; a mismatch (stale plugin sandbox, or a
  // v1 --from-facts file) is refused BEFORE detect with this code (see cli/.../audit-ds.ts §5).
  | 'E_PLUGIN_STALE';

// ── Timeouts (ms) ───────────────────────────────────────────────────
export const DEFAULT_TIMEOUT_MS = 15_000;
export const COMMAND_TIMEOUTS: Partial<Record<CommandName, number>> = {
  HTML_TO_FIGMA: 60_000,
  IMPORT_PAYLOAD: 60_000,
  SCAN_DESIGN_SYSTEM: 30_000,
  AUDIT_DS: 120_000, // usage scan traverses EVERY page's instances — heavier than the DS scan
  EXEC_JS: 30_000, // CLI --timeout may raise, capped at 120s
  BATCH: 60_000,
};
export const EXEC_JS_MAX_TIMEOUT_MS = 120_000;

// Broker lifecycle
export const HEARTBEAT_INTERVAL_MS = 30_000; // broker WS-ping + advertisement refresh
export const HEARTBEAT_STALE_MS = 90_000;
export const BROKER_IDLE_SHUTDOWN_MS = 30 * 60_000; // no plugin AND no CLI (env-overridable in broker)

// ── Application-level heartbeat (plugin ⇄ broker) ───────────────────
// The plugin sends a PING every INTERVAL; if no PONG arrives within TIMEOUT the
// plugin treats the socket as dead and re-enters its reconnect loop. TIMEOUT is
// ~2.5 missed pings so one dropped frame never triggers a false reconnect.
export const PLUGIN_HEARTBEAT_INTERVAL_MS = 10_000;
export const PLUGIN_PONG_TIMEOUT_MS = 25_000;

// ── Plugin reconnect backoff (plugin side, exponential + jitter) ────
export const RECONNECT_BACKOFF_MIN_MS = 500;
export const RECONNECT_BACKOFF_MAX_MS = 8_000;
export const RECONNECT_JITTER = 0.25;

// Broker holds a request for a not-yet-connected plugin up to this long before
// answering E_NO_PLUGIN. Closes the respawn↔reconnect race: a CLI call that just
// spawned a fresh broker waits (bounded) for the plugin's reconnect loop to land,
// instead of failing instantly. Kept below DEFAULT_TIMEOUT_MS so the CLI's own
// timeout never fires first. STATUS is exempt (it must report "disconnected" fast).
export const PLUGIN_WAIT_MS = 12_000;

export function makeRequestId(counter: number): string {
  return `c_${counter}_${Date.now()}`;
}

// ── Connection state machine (single source of truth) ───────────────
// The plugin drives this: disconnected → probing → handshake → connected, and
// back to disconnected on any socket loss. The plugin posts each transition to
// its own UI as a ConnectionStatePayload (see makeStatePayload) — the P2 panel
// redesign consumes exactly that shape via the `figma-agent:conn-state`
// CustomEvent, so this interface is the contract between the relay and the UI.
export type ConnectionState = 'disconnected' | 'probing' | 'handshake' | 'connected';

export type ConnectionEvent = 'PROBE' | 'FOUND' | 'READY' | 'LOST';

/** Pure transition function for the connection state machine (unit-testable). */
export function reduceConnState(current: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event) {
    case 'LOST': return 'disconnected';
    case 'PROBE': return 'probing';
    case 'FOUND': return current === 'probing' ? 'handshake' : current;
    case 'READY': return current === 'handshake' ? 'connected' : current;
    default: return current;
  }
}

/** The postMessage/CustomEvent payload the plugin UI (P2) renders. */
export interface ConnectionStatePayload {
  type: 'CONN_STATE';
  state: ConnectionState;
  /** Timestamp (ms) this state was entered — the UI shows an age from it. */
  since: number;
  /** Short human hint for the current state (e.g. which port is being probed). */
  detail?: string;
  /** Broker WS url, present from `handshake` onward. */
  brokerUrl?: string;
  /** Broker port, present from `handshake` onward. */
  port?: number;
  /** ms since the last broker PONG, present while `connected`. */
  lastPongAge?: number;
  protocolVersion: number;
}

/** Build a ConnectionStatePayload with the protocol version stamped in (pure). */
export function makeStatePayload(
  state: ConnectionState,
  extra: Partial<Omit<ConnectionStatePayload, 'type' | 'state' | 'protocolVersion'>> = {},
): ConnectionStatePayload {
  return {
    type: 'CONN_STATE',
    state,
    since: extra.since ?? Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    ...extra,
  };
}

// ── Reconnect backoff (pure, deterministic with an injected rand) ───
export interface BackoffOpts {
  minMs: number;
  maxMs: number;
  /** Growth multiplier per step (default 2). */
  factor?: number;
  /** Fractional jitter added on top of the base (default RECONNECT_JITTER). */
  jitter?: number;
}

/**
 * Compute the next backoff step. `base` grows deterministically (minMs, then
 * ×factor each call, capped at maxMs) so callers store it for the next step;
 * `delay` is `base` plus up to `jitter·base` of randomness (via the injected
 * `rand`, default Math.random) so a fleet of plugins never reconnect in lockstep.
 * A successful connect resets by passing base 0 next time (→ minMs).
 */
export function nextBackoff(
  prevBase: number,
  opts: BackoffOpts,
  rand: () => number = Math.random,
): { base: number; delay: number } {
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? RECONNECT_JITTER;
  const base = prevBase < opts.minMs ? opts.minMs : Math.min(prevBase * factor, opts.maxMs);
  const delay = Math.round(base + base * jitter * rand());
  return { base, delay };
}
