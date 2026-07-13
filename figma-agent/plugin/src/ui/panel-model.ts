// Pure view-model for the P2 panel — no DOM, no WebSocket, no Figma API.
// panel-ui.ts is the thin DOM glue that renders these; every branch here is
// unit-tested in figma-agent/tests/panel-model.test.ts. Keeping the logic pure
// is the codebase convention (cf. reduceConnState / nextBackoff in protocol.ts):
// the machine is testable in isolation and the UI layer stays dumb.
import type { ConnectionState } from '../../../shared/protocol';

/** Which token pair the status pill + dot render with (maps to --color-<tone>*). */
export type Tone = 'success' | 'warning' | 'info' | 'muted';

export interface StateView {
  /** Big pill label. */
  pill: string;
  /** One plain-language sentence under the pill; '' ⇒ the sentence row is hidden. */
  sentence: string;
  /** Token pair for the pill + dot. */
  tone: Tone;
  /** Probing gently pulses (reduced-motion-guarded in CSS); every other state is still. */
  pulse: boolean;
}

// The four states are the P1 machine's — we only render them, never invent new
// ones (spec: "State machine ĐÃ có (P1): chỉ consume payload"). Copy is verbatim
// from the P2 spec §2; disconnected is muted, NOT red — it is the normal wait.
const STATE_VIEW: Record<ConnectionState, StateView> = {
  connected:    { pill: 'Connected',           tone: 'success', pulse: false, sentence: 'Ready — the CLI can drive this file.' },
  probing:      { pill: 'Looking for broker…', tone: 'warning', pulse: true,  sentence: '' },
  handshake:    { pill: 'Handshaking…',        tone: 'info',    pulse: false, sentence: '' },
  disconnected: { pill: 'No broker yet',       tone: 'muted',   pulse: false, sentence: 'The broker starts automatically on your first CLI command.' },
};

export function stateView(state: ConnectionState): StateView {
  return STATE_VIEW[state] ?? STATE_VIEW.disconnected;
}

/** Compact elapsed label: "just now", "8s", "2m 05s", "1h 03m". Input is ms (≥0). */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/** A completed request's duration: "12ms" under a second, else "1.2s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Relative time for the activity log: "just now", "5s ago", "3m ago", "2h ago". */
export function timeAgo(nowMs: number, atMs: number): string {
  const s = Math.floor((nowMs - atMs) / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export interface ActivityRecord {
  /** Wire command name (STATUS, CREATE_FRAME, HTML_TO_FIGMA…). */
  tool: string;
  ok: boolean;
  /** Round-trip duration in ms. */
  ms: number;
  /** Epoch ms the request started — the log renders a time-ago from it. */
  at: number;
}

/**
 * Coerce a raw `figma-agent:activity` CustomEvent detail (typed `unknown`) into a
 * record, or null if the shape is wrong. Defensive: the event crosses an untyped
 * DOM boundary.
 */
export function toActivityRecord(detail: unknown): ActivityRecord | null {
  if (detail === null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.tool !== 'string' || d.tool === '') return null;
  return {
    tool: d.tool,
    ok: d.ok === true,
    ms: typeof d.ms === 'number' && Number.isFinite(d.ms) && d.ms >= 0 ? d.ms : 0,
    at: typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : Date.now(),
  };
}

/** Readable log label for a wire command: "CREATE_FRAME" → "create frame". */
export function humanizeTool(tool: string): string {
  return tool.toLowerCase().replace(/_/g, ' ');
}

/** Newest-first ring buffer capped at `max` (spec: keep 50, show 8). Returns a NEW array. */
export function pushActivity(
  buf: readonly ActivityRecord[],
  rec: ActivityRecord,
  max = 50,
): ActivityRecord[] {
  return [rec, ...buf].slice(0, Math.max(0, max));
}

/**
 * State-specific troubleshoot hint (spec §6), or null when there's nothing useful
 * to say. `hadConnection` distinguishes a first-run wait (silent) from a dropped
 * link (say we're retrying).
 */
export function troubleshootHint(
  state: ConnectionState,
  ageMs: number,
  hadConnection: boolean,
): string | null {
  if (state === 'probing' && ageMs >= 10_000) {
    return 'Broker not running? Any CLI command spawns it — run figma-agent status in a terminal.';
  }
  if (state === 'disconnected' && hadConnection) {
    return 'Connection lost — retrying automatically.';
  }
  return null;
}

/**
 * Whether the onboarding card shows: only before the very first successful
 * connection, and only while we're waiting (spec §3: "chỉ hiện khi
 * disconnected/probing lần đầu"). Once connected, it never returns.
 */
export function showOnboarding(state: ConnectionState, hadConnection: boolean): boolean {
  return !hadConnection && (state === 'disconnected' || state === 'probing');
}
