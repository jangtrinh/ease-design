/**
 * Figma live-sync apply cursor (spec 004 P4, Tier 3 — the applied-so-far marker).
 *
 * `ui figma reconcile --apply` walks the append-only change-log from a line-count
 * cursor. That cursor is persisted HERE — `design/figma-sync.state.json` — so the
 * NEXT apply starts where the last one stopped, and a replay can rewind it. The log
 * is the source of truth (audit + undo); this file is just "how far have we applied".
 *
 * Deliberately separate from the log and the registry: the log is append-only
 * (never rewritten), the registry is the materialized view, and this is the single
 * mutable integer between them. Absent file → cursor 0 (apply the whole log).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Path of the apply-cursor state file, relative to a project dir. */
export const SYNC_STATE_RELPATH = ["design", "figma-sync.state.json"] as const;

/** Absolute path to `<dir>/design/figma-sync.state.json`. */
export function syncStatePath(dir: string): string {
  return join(dir, ...SYNC_STATE_RELPATH);
}

/**
 * Read the persisted apply cursor. Absent file → 0. A malformed / non-integer
 * value is treated as 0 (a corrupt marker must not wedge the loop — the log is
 * still the truth and a full re-apply is deterministic).
 */
export function readCursor(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { cursor?: unknown };
    const c = parsed?.cursor;
    return typeof c === "number" && Number.isInteger(c) && c >= 0 ? c : 0;
  } catch {
    return 0;
  }
}

/** Write the apply cursor (deterministic, trailing newline; mirrors saveRegistry). */
export function writeCursor(path: string, cursor: number): void {
  mkdirSync(dirname(path), { recursive: true }); // design/ may not exist yet on a fresh project
  writeFileSync(path, JSON.stringify({ cursor }, null, 2) + "\n", "utf8");
}
