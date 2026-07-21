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

// The activity feed's own vocabulary (records, labels, durations, result
// summaries) lives in ./activity-feed.ts — this module owns the connection chrome.

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

// ─── Panel layout mode (P5.1: compact-first) ─────────────────────────────────
// The panel opens COMPACT (owner decree: small + minimal on the canvas) and
// expands only on demand. Mode is session-local — always compact on open, no
// persistence. main.ts reads the same constants for figma.showUI/resize so the
// iframe and the layout can never disagree.

export type PanelMode = 'compact' | 'expanded';

export const PANEL_WIDTH = 300;
export const PANEL_HEIGHT: Record<PanelMode, number> = { compact: 170, expanded: 460 };

export function togglePanelMode(mode: PanelMode): PanelMode {
  return mode === 'expanded' ? 'compact' : 'expanded';
}

/** Footer toggle label. The Phosphor caret rotates from aria-expanded in CSS. */
export function detailsLabel(_mode: PanelMode): string {
  return 'Details';
}

// ─── Idle-commit sync prompt (spec 004 P4) ────────────────────────────────────
// The panel gains ONE line at the idle point: "N changes ready — Sync now / Later"
// (reuses the existing status surface; no new panel). These pure helpers format that
// line + the post-sync confirmation; panel-ui.ts is the DOM glue that shows/hides it.

/** "3 changes ready" / "1 change ready" — pluralized, count floored at 1 for display. */
export function syncPromptLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  return `${n} change${n === 1 ? '' : 's'} ready`;
}

/**
 * Post-apply confirmation line for the prompt.
 *
 * `landed` is what the kernel actually wrote to the registry (spec 005 P4) — NOT the
 * number of canvas events that were sent. An apply can succeed and change nothing (every
 * new component still pending re-ingest), and calling that "Synced ✓" is the dishonesty
 * this argument exists to kill (Art VIII). The summary itself comes from
 * shared/figma-sync-summary.ts, so the broker and this line make the same claim.
 */
export function syncResultLabel(ok: boolean, summary: string, landed = true): string {
  const clean = typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : (ok ? 'done' : 'failed');
  if (!ok) return `Sync failed — ${clean}`;
  return landed ? `Synced ✓ — ${clean}` : `Nothing synced — ${clean}`;
}

/**
 * Compact-mode meta-line override. Compact drops the status sentence, so the
 * disconnected wait must still communicate on the ONE remaining line (spec §3).
 * The pill directly above already reads "No broker yet" — the meta carries only
 * the next step, so the 276px column keeps it to one physical line.
 * Null means "no override — use the regular meta line".
 */
export function compactMeta(state: ConnectionState): string | null {
  return state === 'disconnected' ? 'First CLI command starts it' : null;
}
