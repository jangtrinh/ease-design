// Figma live-sync config (spec 004 P4) — the idle window the broker passes to the
// plugin. One line in the project: `design/figma-sync.json` {"idleMs": 300000}. The
// broker reads it once at connect and sends it as SYNC_CONFIG; the plugin's idle
// timer uses it (clamped to a floor). Kept tiny + pure-ish (fs read only, no network).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_IDLE_MS, MIN_IDLE_MS } from '../../../shared/protocol.ts';
import { changeLogDir } from './change-log.ts';

export const SYNC_CONFIG_FILENAME = 'figma-sync.json';

/** Project dir holding `design/` — the parent of the change-log dir. */
export function projectDir(): string {
  return dirname(changeLogDir());
}

/** Absolute path to `<project>/design/figma-sync.json`. */
export function syncConfigPath(): string {
  return join(changeLogDir(), SYNC_CONFIG_FILENAME);
}

/**
 * Resolve the idle window in ms. Order: `FIGMA_AGENT_IDLE_MS` env (fast test
 * override) → `design/figma-sync.json` {"idleMs"} → DEFAULT_IDLE_MS. Any malformed
 * / too-small value floors to MIN_IDLE_MS so a typo can never spin the timer.
 */
export function readIdleMs(): number {
  const env = process.env['FIGMA_AGENT_IDLE_MS'];
  if (env !== undefined) return clampIdle(Number(env));

  const path = syncConfigPath();
  if (!existsSync(path)) return DEFAULT_IDLE_MS;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { idleMs?: unknown };
    const raw = parsed?.idleMs;
    return typeof raw === 'number' ? clampIdle(raw) : DEFAULT_IDLE_MS;
  } catch {
    return DEFAULT_IDLE_MS; // a broken config never disables the loop — fall back to default
  }
}

function clampIdle(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDLE_MS;
  return Math.max(MIN_IDLE_MS, Math.floor(n));
}
