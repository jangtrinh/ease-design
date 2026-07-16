// Pure view-model for the panel's ACTIVITY FEED — no DOM, no WebSocket, no Figma
// API. Split out of panel-model.ts (which owns the connection chrome) when the feed
// grew a per-operation vocabulary of its own; panel-ui.ts is the DOM glue and
// ui-relay.ts feeds it. The rows' OUTCOME lines are derived in ./activity-summary.ts
// (the relay's half). Every branch here is unit-tested in
// figma-agent/tests/activity-feed.test.ts.
//
// WHY A LABEL AT ALL: the wire `cmd` is opaque about intent. EXEC_JS is injected
// code — a scan, a mirror-verify rebuild and an ad-hoc script are the same `cmd`,
// so a cmd-only feed can only ever say "exec js" while the user waits. The CLI
// therefore states its intent on the request (RequestMsg.activity) and we render
// THAT, falling back to a humanized `cmd` when it is absent (an older CLI).

/** One row of the feed: a request from the moment it starts until its reply lands. */
export interface ActivityRecord {
  /** Wire request id — the join between the start event and its result. */
  id: string;
  /** Wire command name (EXEC_JS, IMPORT_PAYLOAD…) — the label's fallback. */
  tool: string;
  /** The CLI's intent label ("Scan · 1:23"); absent ⇒ fall back to `tool`. */
  label?: string;
  /** Result summary once done ("→ 42 nodes", "✗ node not found"); absent while pending. */
  result?: string;
  /** True until the reply lands — the row renders as in-flight. */
  pending: boolean;
  ok: boolean;
  /** Round-trip duration in ms (0 while pending). */
  ms: number;
  /** Epoch ms the request started — the row renders a clock time from it. */
  at: number;
}

/** Readable log label for a wire command: "CREATE_FRAME" → "create frame". */
export function humanizeTool(tool: string): string {
  return tool.toLowerCase().replace(/_/g, ' ');
}

/** What the row's headline reads: the CLI's intent, else the humanized command. */
export function activityLabel(rec: ActivityRecord): string {
  const label = typeof rec.label === 'string' ? rec.label.trim() : '';
  return label !== '' ? label : humanizeTool(rec.tool);
}

/** Wall-clock stamp for a row: "14:32:07" (local time, zero-padded). Kept for the status snapshot. */
export function formatClock(at: number): string {
  if (!Number.isFinite(at)) return '--:--:--';
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

/**
 * The row's SECOND line — outcome and timing folded into ONE muted sentence:
 *   "→ 42 nodes · 173ms · 2m ago" | "running… · just now" | "✗ node not found · 8ms · 3s ago"
 * Deliberately carries no wall-clock stamp: the relative age already answers "when",
 * and the absolute time is what used to crowd the label — the only line that says WHAT
 * the plugin is doing — off the row entirely on a narrow panel.
 */
export function activityMeta(rec: ActivityRecord, now: number): string {
  const parts: string[] = [];
  if (rec.result) parts.push(rec.result);
  parts.push(rec.pending ? 'running…' : formatDuration(rec.ms));
  parts.push(timeAgo(now, rec.at));
  return parts.join(' · ');
}

/**
 * Coerce a raw `figma-agent:activity` start-event detail (typed `unknown`) into a
 * pending record, or null if the shape is wrong. Defensive: the event crosses an
 * untyped DOM boundary.
 */
export function toActivityRecord(detail: unknown): ActivityRecord | null {
  if (detail === null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.tool !== 'string' || d.tool === '') return null;
  const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : Date.now();
  const rec: ActivityRecord = {
    id: typeof d.id === 'string' && d.id !== '' ? d.id : `${d.tool}:${at}`,
    tool: d.tool,
    pending: true,
    ok: true,
    ms: 0,
    at,
  };
  if (typeof d.label === 'string' && d.label.trim() !== '') rec.label = d.label.trim();
  return rec;
}

/** A landed reply, as carried by the `figma-agent:activity` done-event. */
export interface ActivityResult {
  id: string;
  ok: boolean;
  ms: number;
  result?: string;
}

/** Coerce a done-event detail into a result patch, or null if the shape is wrong. */
export function toActivityResult(detail: unknown): ActivityResult | null {
  if (detail === null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.id !== 'string' || d.id === '') return null;
  const patch: ActivityResult = {
    id: d.id,
    ok: d.ok === true,
    ms: typeof d.ms === 'number' && Number.isFinite(d.ms) && d.ms >= 0 ? d.ms : 0,
  };
  if (typeof d.result === 'string' && d.result !== '') patch.result = d.result;
  return patch;
}

/** Newest-first ring buffer capped at `max` (keep 50, the feed shows 20). Returns a NEW array. */
export function pushActivity(
  buf: readonly ActivityRecord[],
  rec: ActivityRecord,
  max = 50,
): ActivityRecord[] {
  return [rec, ...buf].slice(0, Math.max(0, max));
}

/**
 * Land a reply onto its own start-row, matched by request id — NOT by position.
 * Two commands can be in flight at once (the panel is shared by every CLI caller),
 * so "newest row" is not "the row this reply belongs to". An id with no row left in
 * the buffer (evicted by the cap) is dropped: a stale reply must never rewrite an
 * unrelated row.
 */
export function resolveActivity(
  buf: readonly ActivityRecord[],
  patch: ActivityResult,
): ActivityRecord[] {
  return buf.map((rec) => {
    if (rec.id !== patch.id) return rec;
    const next: ActivityRecord = { ...rec, pending: false, ok: patch.ok, ms: patch.ms };
    if (patch.result !== undefined) next.result = patch.result;
    return next;
  });
}
