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
export interface EventMsg {
  type: 'BROKER_HELLO' | 'PLUGIN_HELLO' | 'FILE_INFO' | 'PLUGIN_GONE';
  data: Record<string, unknown>;
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
  | 'E_CHUNK_LOST';

// ── Timeouts (ms) ───────────────────────────────────────────────────
export const DEFAULT_TIMEOUT_MS = 15_000;
export const COMMAND_TIMEOUTS: Partial<Record<CommandName, number>> = {
  HTML_TO_FIGMA: 60_000,
  IMPORT_PAYLOAD: 60_000,
  SCAN_DESIGN_SYSTEM: 30_000,
  EXEC_JS: 30_000, // CLI --timeout may raise, capped at 120s
  BATCH: 60_000,
};
export const EXEC_JS_MAX_TIMEOUT_MS = 120_000;

// Broker lifecycle
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_STALE_MS = 90_000;
export const BROKER_IDLE_SHUTDOWN_MS = 30 * 60_000; // no plugin AND no CLI

export function makeRequestId(counter: number): string {
  return `c_${counter}_${Date.now()}`;
}
