// Figma live-sync apply orchestration (spec 004 P4 + spec 005 P4) — the broker's
// SYNC_REQUEST handler.
//
// The panel's "Sync now" click reaches the broker as SYNC_REQUEST; the broker runs the
// DETERMINISTIC kernel to commit — `ui figma reconcile --apply` — rather than touching the
// registry itself. Keeping apply in `ui` is the whole point: the broker stays a relay; all
// registry-write logic lives in the tested, pure kernel.
//
// Spec 005 P4 makes it a three-step chain, because a 1:1 mirror needs live data the kernel
// is forbidden to fetch (Art I.2):
//   1. `ui figma reconcile --dry-run --json` → which components changed, with their nodeIds
//   2. `figma-agent scan-node <id>` per component → their node specs → a capture file
//   3. `ui figma reconcile --apply --mirror-file <file> --json` → sidecars + registry
// Step 2 is the ONLY live step and lives in figma-mirror-capture-run.ts. If it yields
// nothing (plugin down, scan failed), step 3 still runs and reports what did not mirror.
//
// Best-effort + debounced: a spawn failure (no `ui` on PATH) is reported back, never
// thrown; a second click while one apply is in flight is ignored (broker-daemon).
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  countsFromApplyReport,
  emptyCounts,
  landed,
  syncSummary,
  type AppliedCounts,
} from '../../../shared/figma-sync-summary.ts';
import { captureMirror, targetsFromDelta } from './figma-mirror-capture-run.ts';

/** Outcome the broker sends back to the plugin as SYNC_RESULT.data. */
export interface SyncApplyResult {
  ok: boolean;
  /** One honest line for the panel — what changed in the registry, or why nothing did. */
  summary: string;
  /** False ⇒ the apply ran but no record changed; the panel must not claim "Synced". */
  landed?: boolean;
  /** The kernel's apply report when it succeeded. */
  applied?: unknown;
  code?: string;
}

/** Resolve the `ui` kernel binary — env override (tests) → PATH lookup by name. */
function uiBin(): string {
  return process.env['FIGMA_AGENT_UI_BIN'] || process.env['DESIGN_OS_UI_BIN'] || 'ui';
}

/** Run `ui figma reconcile …` and hand back the parsed envelope. Never throws. */
function runReconcile(
  projectDir: string,
  extra: string[],
  done: (env: Record<string, unknown> | null, err: string, exit: number) => void,
): void {
  let child;
  try {
    child = spawn(uiBin(), ['figma', 'reconcile', '--dir', projectDir, '--json', ...extra], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    done(null, `could not launch ui: ${(err as Error).message}`, -1);
    return;
  }
  let out = '';
  let err = '';
  child.stdout?.on('data', (d) => { out += String(d); });
  child.stderr?.on('data', (d) => { err += String(d); });
  child.on('error', (e) => done(null, `ui not runnable: ${e.message} (is the kernel linked?)`, -1));
  child.on('close', (exit) => {
    let env: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(out.trim());
      if (parsed && typeof parsed === 'object') env = parsed as Record<string, unknown>;
    } catch { /* non-JSON stdout — the exit-code path below reports it */ }
    done(env, err, exit ?? -1);
  });
}

/** Envelope → failure result (shared by both kernel steps). */
function envelopeFailure(env: Record<string, unknown> | null, err: string, exit: number): SyncApplyResult {
  if (env && env['ok'] === false && env['error'] && typeof env['error'] === 'object') {
    const e = env['error'] as { code?: unknown; message?: unknown };
    return { ok: false, summary: String(e.message ?? 'reconcile failed'), code: String(e.code ?? 'RECONCILE_FAILED') };
  }
  return { ok: false, summary: err.trim() || `ui exited ${exit}`, code: 'RECONCILE_FAILED' };
}

function envelopeData(env: Record<string, unknown> | null): Record<string, unknown> | null {
  if (env && env['ok'] === true && env['data'] && typeof env['data'] === 'object') {
    return env['data'] as Record<string, unknown>;
  }
  return null;
}

/**
 * Run the full sync: preview → scoped mirror capture → apply. `done` always receives a
 * result; every failure path degrades rather than throwing.
 */
export function spawnReconcileApply(projectDir: string, done: (r: SyncApplyResult) => void): void {
  runReconcile(projectDir, ['--dry-run'], (env, err, exit) => {
    const data = envelopeData(env);
    if (data === null) {
      done(envelopeFailure(env, err, exit));
      return;
    }
    const targets = targetsFromDelta(data);
    void captureMirror(targets).then((cap) => {
      const extra = ['--apply', ...(cap.file !== undefined ? ['--mirror-file', cap.file] : [])];
      runReconcile(projectDir, extra, (aEnv, aErr, aExit) => {
        if (cap.file !== undefined) {
          try { rmSync(dirname(cap.file), { recursive: true, force: true }); } catch { /* tmp — leave it */ }
        }
        const aData = envelopeData(aEnv);
        if (aData === null) {
          done(envelopeFailure(aEnv, aErr, aExit));
          return;
        }
        done(applyResult(aData['apply'], cap.dropped));
      });
    });
  });
}

/** Shape the panel-facing result from the kernel's apply report. */
export function applyResult(apply: unknown, dropped = 0): SyncApplyResult {
  const counts: AppliedCounts = apply === undefined ? emptyCounts() : countsFromApplyReport(apply);
  const summary = dropped > 0 ? `${syncSummary(counts)} — ${dropped} not scanned (batch cap)` : syncSummary(counts);
  return { ok: true, summary, landed: landed(counts) > 0, applied: apply };
}
