// Figma live-sync apply spawner (spec 004 P4) — the broker's SYNC_REQUEST handler.
//
// The panel's "Sync now" click reaches the broker as a SYNC_REQUEST event; the broker
// runs the DETERMINISTIC kernel to commit — `ui figma reconcile --apply` — rather than
// touching the registry itself. Keeping apply in `ui` is the whole point: the broker
// stays a dumb relay; all registry-write logic lives in the tested, pure kernel.
//
// Best-effort + debounced: a spawn failure (no `ui` on PATH) is reported back, never
// thrown; a second click while one apply is in flight is ignored.
import { spawn } from 'node:child_process';

/** Outcome the broker sends back to the plugin as SYNC_RESULT.data. */
export interface SyncApplyResult {
  ok: boolean;
  /** One-line human summary (from the kernel envelope, or the failure reason). */
  summary: string;
  /** The kernel's apply report when it succeeded ({deprecated, updated, pending, skipped}). */
  applied?: unknown;
  code?: string;
}

/** Resolve the `ui` kernel binary — env override (tests) → PATH lookup by name. */
function uiBin(): string {
  return process.env['FIGMA_AGENT_UI_BIN'] || process.env['DESIGN_OS_UI_BIN'] || 'ui';
}

/**
 * Spawn `ui figma reconcile --apply --dir <projectDir> --json`, parse the envelope,
 * and hand a SyncApplyResult to `done`. Never throws — every failure path resolves
 * `done` with ok:false so the caller (broker) can relay it and move on.
 */
export function spawnReconcileApply(projectDir: string, done: (r: SyncApplyResult) => void): void {
  let child;
  try {
    child = spawn(uiBin(), ['figma', 'reconcile', '--apply', '--dir', projectDir, '--json'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    done({ ok: false, summary: `could not launch ui: ${(err as Error).message}`, code: 'SPAWN_FAILED' });
    return;
  }

  let out = '';
  let err = '';
  child.stdout?.on('data', (d) => { out += String(d); });
  child.stderr?.on('data', (d) => { err += String(d); });
  child.on('error', (e) => {
    done({ ok: false, summary: `ui not runnable: ${e.message} (is the kernel linked?)`, code: 'SPAWN_FAILED' });
  });
  child.on('close', (exit) => {
    done(parseEnvelope(out, err, exit ?? -1));
  });
}

/** Turn the kernel's `--json` envelope into a SyncApplyResult (tolerant of noise). */
function parseEnvelope(out: string, err: string, exit: number): SyncApplyResult {
  let env: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(out.trim());
    if (parsed && typeof parsed === 'object') env = parsed as Record<string, unknown>;
  } catch { /* non-JSON stdout — fall through to the exit-code path */ }

  if (env && env['ok'] === true && env['data'] && typeof env['data'] === 'object') {
    const data = env['data'] as Record<string, unknown>;
    const apply = data['apply'] as { deprecated?: unknown[]; updated?: unknown[]; pending?: unknown[] } | undefined;
    const dep = Array.isArray(apply?.deprecated) ? apply!.deprecated.length : 0;
    const upd = Array.isArray(apply?.updated) ? apply!.updated.length : 0;
    const pend = Array.isArray(apply?.pending) ? apply!.pending.length : 0;
    return {
      ok: true,
      summary: `synced — ${upd} updated, ${dep} deprecated, ${pend} pending`,
      applied: data['apply'],
    };
  }
  if (env && env['ok'] === false && env['error'] && typeof env['error'] === 'object') {
    const e = env['error'] as { code?: unknown; message?: unknown };
    return { ok: false, summary: String(e.message ?? 'reconcile failed'), code: String(e.code ?? 'RECONCILE_FAILED') };
  }
  return { ok: false, summary: err.trim() || `ui exited ${exit}`, code: 'RECONCILE_FAILED' };
}
