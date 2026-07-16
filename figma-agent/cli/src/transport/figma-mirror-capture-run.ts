// Scoped mirror capture (spec 005 P4) — the LIVE half of a sync-apply.
//
// This is where the plugin call lives, and deliberately NOT in the `ui` kernel: scanning a
// node means asking the open Figma file over the broker socket, and the kernel is pure by
// constitution (Art I.2 — no network, ever). So the flow is:
//
//   ui figma reconcile --dry-run  →  which components changed (+ their nodeIds)
//   figma-agent scan-node <id>    →  each one's FigmaExportNode spec   ← live, here
//   <capture file>                →  ui figma reconcile --apply --mirror-file …
//
// The kernel then does the deterministic part (sidecar + registry pointer) from a plain
// file. Best-effort by design: every scan failure becomes a named `failed` entry, so an
// apply with the plugin down still commits what the log implies and reports the rest as
// un-mirrored. Nothing here ever throws at the broker.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selfBundlePath } from './broker-discovery.ts';

/** Must equal the kernel's MIRROR_CAPTURE_VERSION (src/core/figma-mirror-capture.ts). */
const MIRROR_CAPTURE_VERSION = 1;
/** Per-node scan budget. scan-node bundles the walker + round-trips the plugin. */
const SCAN_TIMEOUT_MS = 30_000;
/** Cap on components scanned in one sync — a huge batch must not hang the panel. */
const MAX_SCANS = 40;

/** One component the mirror should capture, from the reconcile dry-run delta. */
export interface MirrorTarget {
  nodeId: string;
  name: string;
}

export interface MirrorCaptureResult {
  /** Path of the capture file to hand `--mirror-file`, or undefined when nothing was scanned. */
  file?: string;
  captured: number;
  failed: number;
  /** Targets dropped by MAX_SCANS — reported, never silently truncated. */
  dropped: number;
}

/** Read the ADD/EDIT targets out of a `ui figma reconcile --dry-run --json` envelope. */
export function targetsFromDelta(data: unknown): MirrorTarget[] {
  const d = data as { delta?: { added?: unknown; updated?: unknown } } | null;
  const out: MirrorTarget[] = [];
  for (const group of [d?.delta?.added, d?.delta?.updated]) {
    if (!Array.isArray(group)) continue;
    for (const e of group) {
      const item = e as { nodeId?: unknown; name?: unknown };
      if (typeof item?.nodeId === 'string' && item.nodeId && typeof item.name === 'string' && item.name) {
        out.push({ nodeId: item.nodeId, name: item.name });
      }
    }
  }
  return out;
}

/**
 * Scan one node via the CLI's own `scan-node` command, in a child process.
 *
 * A child (rather than an in-broker socket call) reuses the exact transport every other
 * command is proven on — this code runs INSIDE the broker daemon, and a self-connection
 * would be a second, untested path to the plugin. Resolves `null` + a reason on any
 * failure; never rejects.
 */
function scanNode(nodeId: string): Promise<{ node?: unknown; reason?: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, [selfBundlePath(), 'scan-node', nodeId, '--timeout', String(SCAN_TIMEOUT_MS)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ reason: `cannot launch scan-node: ${(err as Error).message}` });
      return;
    }
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => { out += String(d); });
    child.stderr?.on('data', (d) => { err += String(d); });
    child.on('error', (e) => resolve({ reason: `scan-node not runnable: ${e.message}` }));
    child.on('close', () => resolve(parseScan(out, err)));
  });
}

/** `scan-node` prints one JSON object: the EXEC_JS result `{result, console, ms}` or `{error}`. */
function parseScan(out: string, err: string): { node?: unknown; reason?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.trim());
  } catch {
    return { reason: err.trim() || 'scan-node produced no JSON (is the plugin open?)' };
  }
  const p = parsed as { result?: unknown; error?: { code?: unknown; message?: unknown } } | null;
  if (p?.error) return { reason: String(p.error.message ?? p.error.code ?? 'scan failed') };
  if (p?.result === undefined || p.result === null) return { reason: 'scan-node returned no node spec' };
  return { node: p.result };
}

/**
 * Scan every target and write the capture file. Sequential on purpose: the plugin main
 * thread is single-threaded, and a burst of parallel EXEC_JS would queue there anyway
 * while making a timeout impossible to attribute.
 */
export async function captureMirror(targets: readonly MirrorTarget[]): Promise<MirrorCaptureResult> {
  const scanned = targets.slice(0, MAX_SCANS);
  const dropped = targets.length - scanned.length;
  if (scanned.length === 0) return { captured: 0, failed: 0, dropped };

  const captured: { nodeId: string; name: string; node: unknown }[] = [];
  const failed: { nodeId: string; name: string; reason: string }[] = [];
  for (const t of scanned) {
    const r = await scanNode(t.nodeId);
    if (r.node !== undefined) captured.push({ nodeId: t.nodeId, name: t.name, node: r.node });
    else failed.push({ nodeId: t.nodeId, name: t.name, reason: r.reason ?? 'scan failed' });
  }

  const payload = { v: MIRROR_CAPTURE_VERSION, captured, failed };
  try {
    const dir = mkdtempSync(join(tmpdir(), 'figma-mirror-'));
    const file = join(dir, 'capture.json');
    writeFileSync(file, JSON.stringify(payload), 'utf8');
    return { file, captured: captured.length, failed: failed.length, dropped };
  } catch {
    // Cannot stage the capture → apply still runs, just without a mirror.
    return { captured: 0, failed: failed.length + captured.length, dropped };
  }
}
