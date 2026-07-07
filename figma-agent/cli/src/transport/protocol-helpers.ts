// Wire-protocol helpers shared by broker daemon + broker client:
// typed guards, chunked send (>512KB), chunk reassembly, raw-frame decoding.
// Protocol constants/types live in shared/protocol.ts (frozen contract).
import {
  CHUNK_LIMIT,
  type ChunkMsg,
  type ErrorCode,
  type EventMsg,
  type ReplyMsg,
  type RequestMsg,
  type WireMsg,
} from '../../../shared/protocol.ts';

/** Error carrying a protocol error code; the CLI prints it as {error:{code,message}}. */
export class CliError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

/** ws 'message' payloads arrive as Buffer | ArrayBuffer | Buffer[] — normalize to utf8 text. */
export function rawToString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return (raw as Buffer).toString('utf8');
}

export function parseWireMsg(text: string): WireMsg | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' ? (value as WireMsg) : null;
  } catch {
    return null;
  }
}

// ── Type guards (check most-specific shape first at call sites) ─────
export function isChunkMsg(m: WireMsg): m is ChunkMsg {
  const c = m as ChunkMsg;
  return typeof c.id === 'string' && typeof c.seq === 'number' && typeof c.chunk === 'string';
}

export function isReplyMsg(m: WireMsg): m is ReplyMsg {
  const r = m as ReplyMsg;
  return typeof r.id === 'string' && typeof (r as { ok?: unknown }).ok === 'boolean';
}

export function isRequestMsg(m: WireMsg): m is RequestMsg {
  const r = m as RequestMsg;
  return typeof r.id === 'string' && typeof r.cmd === 'string';
}

export function isEventMsg(m: WireMsg): m is EventMsg {
  return typeof (m as EventMsg).type === 'string' && !('id' in m);
}

/** Minimal structural socket type so both ws server-side and client sockets fit. */
interface Sendable {
  send(data: string): void;
}

/**
 * Send a wire message, splitting into {id,seq,last,chunk} frames when the
 * serialized form exceeds CHUNK_LIMIT (both directions per protocol §2).
 */
export function sendWireMsg(ws: Sendable, msg: RequestMsg | ReplyMsg | EventMsg): void {
  const full = JSON.stringify(msg);
  if (full.length <= CHUNK_LIMIT || !('id' in msg)) {
    ws.send(full);
    return;
  }
  const totalChunks = Math.ceil(full.length / CHUNK_LIMIT);
  for (let seq = 0; seq < totalChunks; seq++) {
    const frame: ChunkMsg = {
      id: msg.id,
      seq,
      last: seq === totalChunks - 1,
      chunk: full.slice(seq * CHUNK_LIMIT, (seq + 1) * CHUNK_LIMIT),
    };
    ws.send(JSON.stringify(frame));
  }
}

/**
 * Reassembles chunked messages by id. WS frames are TCP-ordered, so the
 * `last` frame arrives last; missing frames at that point → E_CHUNK_LOST.
 */
export class ChunkAssembler {
  private readonly parts = new Map<string, { chunks: string[]; received: number }>();

  /** Returns the fully reassembled message when `last` arrives, else null. */
  accept(msg: ChunkMsg): WireMsg | null {
    let entry = this.parts.get(msg.id);
    if (!entry) {
      entry = { chunks: [], received: 0 };
      this.parts.set(msg.id, entry);
    }
    if (entry.chunks[msg.seq] === undefined) entry.received++;
    entry.chunks[msg.seq] = msg.chunk;
    if (!msg.last) return null;

    this.parts.delete(msg.id);
    const total = msg.seq + 1;
    if (entry.received !== total) {
      throw new CliError('E_CHUNK_LOST', `chunked message ${msg.id}: received ${entry.received}/${total} frames`);
    }
    const parsed = parseWireMsg(entry.chunks.join(''));
    if (!parsed) {
      throw new CliError('E_CHUNK_LOST', `chunked message ${msg.id}: reassembled JSON is invalid`);
    }
    return parsed;
  }
}
