/**
 * Mirror-capture file contract (spec 005 P4) — the deterministic INPUT that carries
 * live-scanned Figma node specs into `ui figma reconcile --apply`.
 *
 * Why a file: capturing a node means asking the live plugin (`figma-agent scan-node
 * <nodeId>`), which is a network call — forbidden inside the kernel (Art I.2: the `ui`
 * binary is pure, no network, no model calls). So the capture happens OUTSIDE, in the
 * broker's sync-apply orchestration (`figma-agent/cli/src/transport/`), which writes what
 * it scanned to this file; apply then reads it as ordinary data. Same file in → same
 * bytes out, forever, with no plugin in the loop. This module is the parse/validate half:
 * pure, no fs (the runner owns the read).
 *
 * The file is a transport artifact, not a stored one — the sidecars (figma-node-reader.ts)
 * are the durable record. The producer's shape is mirrored here rather than imported for
 * the same reason `figma-reconcile.ts` re-declares `ChangeFrame`: figma-agent is a separate
 * bundle outside this tsconfig, so the FILE is the contract, not the type.
 */
import { ReconcileError } from "./figma-reconcile.js";
import { RegistryError } from "./registry-store.js";
import { validateFigmaNodeSpec, type FigmaNodeSpec } from "./figma-node-reader.js";

/** Must equal the writer's version (figma-agent mirror-capture-run). */
export const MIRROR_CAPTURE_VERSION = 1;

/** One successfully scanned component. */
export interface MirrorCaptureEntry {
  nodeId: string;
  name: string;
  node: FigmaNodeSpec;
}

/** One component the capture pass could NOT scan — surfaced, never silently dropped. */
export interface MirrorCaptureFailure {
  nodeId: string;
  name: string;
  reason: string;
}

/** The on-disk `--mirror-file` payload. */
export interface MirrorCapture {
  v: number;
  captured: MirrorCaptureEntry[];
  failed: MirrorCaptureFailure[];
}

/**
 * Captures indexed by the change-log `nodeId` — the key apply joins the delta on.
 * A node id appearing in neither map means the capture pass never targeted it.
 */
export interface MirrorIndex {
  specs: ReadonlyMap<string, FigmaNodeSpec>;
  failures: ReadonlyMap<string, string>;
}

/**
 * Parse + validate a mirror-capture file.
 *
 * Fails hard on any malformation (like `parseChangeLog`): the producer is our own
 * broker, so a corrupt capture is a bug to surface, not data to guess at. A scan that
 * FAILED is not a malformation — it belongs in `failed` and reaches the report.
 *
 * @throws ReconcileError("BAD_MIRROR_CAPTURE")
 */
export function parseMirrorCapture(raw: string, source: string): MirrorCapture {
  const bad = (msg: string): never => {
    throw new ReconcileError("BAD_MIRROR_CAPTURE", `mirror capture '${source}': ${msg}`);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bad("not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return bad("root must be an object");
  }
  const root = parsed as Record<string, unknown>;
  if (root["v"] !== MIRROR_CAPTURE_VERSION) {
    return bad(`unsupported version ${String(root["v"])} (expected ${MIRROR_CAPTURE_VERSION})`);
  }
  if (!Array.isArray(root["captured"])) return bad("'captured' must be an array");
  if (!Array.isArray(root["failed"])) return bad("'failed' must be an array");

  const captured: MirrorCaptureEntry[] = [];
  for (const [i, item] of (root["captured"] as unknown[]).entries()) {
    const e = requireEntry(item, `captured[${i}]`, bad);
    let node: FigmaNodeSpec;
    try {
      node = validateFigmaNodeSpec(e["node"], `${source} captured[${i}]`, "BAD_MIRROR_CAPTURE");
    } catch (err) {
      // The shared validator throws a RegistryError; re-shape it to this boundary's error.
      if (err instanceof RegistryError) return bad(err.message);
      throw err;
    }
    captured.push({ nodeId: e["nodeId"] as string, name: e["name"] as string, node });
  }

  const failed: MirrorCaptureFailure[] = [];
  for (const [i, item] of (root["failed"] as unknown[]).entries()) {
    const e = requireEntry(item, `failed[${i}]`, bad);
    if (typeof e["reason"] !== "string" || e["reason"].length === 0) {
      return bad(`failed[${i}].reason must be a non-empty string`);
    }
    failed.push({ nodeId: e["nodeId"] as string, name: e["name"] as string, reason: e["reason"] });
  }

  return { v: MIRROR_CAPTURE_VERSION, captured, failed };
}

/** Shared shape floor for both arrays: an object carrying `nodeId` + `name`. */
function requireEntry(
  item: unknown,
  at: string,
  bad: (msg: string) => never,
): Record<string, unknown> {
  if (item === null || typeof item !== "object" || Array.isArray(item)) bad(`${at} must be an object`);
  const e = item as Record<string, unknown>;
  if (typeof e["nodeId"] !== "string" || e["nodeId"].length === 0) {
    bad(`${at}.nodeId must be a non-empty string`);
  }
  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    bad(`${at}.name must be a non-empty string`);
  }
  return e;
}

/**
 * Index a capture by node id for apply's join. A node id in BOTH arrays keeps the
 * successful spec — a later successful re-scan of the same node supersedes an earlier
 * failure, and apply prefers the real data.
 */
export function indexCaptures(capture: MirrorCapture): MirrorIndex {
  const specs = new Map<string, FigmaNodeSpec>();
  for (const e of capture.captured) specs.set(e.nodeId, e.node);
  const failures = new Map<string, string>();
  for (const f of capture.failed) {
    if (!specs.has(f.nodeId)) failures.set(f.nodeId, f.reason);
  }
  return { specs, failures };
}
