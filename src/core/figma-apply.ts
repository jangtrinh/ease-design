/**
 * Figma live-sync APPLY core (spec 004 P4 + spec 005 P4, Tier 3 — deterministic, pure).
 *
 * Takes the P2 preview-delta (src/core/figma-reconcile.ts), the current registry, and —
 * since spec 005 P4 — an optional MIRROR INDEX of node specs already captured from the
 * live plugin (figma-mirror-capture.ts). Returns the NEXT registry, the sidecar writes to
 * perform, and a report of what actually landed. No fs, no network, no LLM: the command
 * layer (figma-reconcile-run.ts) owns all IO and the cursor advance, and the live scan
 * happens outside the kernel entirely (Art I.2). Zero fabrication: apply writes only what
 * the log + the captured specs can faithfully imply.
 *
 * What apply writes:
 *   - deprecated (a DELETE)  → set `deprecated: true` on the existing record.
 *   - updated (a re-touch)   → refresh `scope`, clear any `deprecated` (it is live again),
 *                              and — with a capture — replace the node sidecar 1:1 and
 *                              point the record at it.
 *   - added (a NEW component) → WITH a capture, materialize the record around the captured
 *                              node spec (that spec IS the component's definition; `markup`
 *                              stays "" because HTML is one-way design→code, the same
 *                              convention `ingest-figma-ds` already writes for a Figma
 *                              scan). WITHOUT a capture the log alone carries no content,
 *                              so the component stays `pending` for `ui ingest-figma-ds` —
 *                              materializing a stub would fabricate content (spec 004 note).
 *
 * Degrade explicitly: when the plugin is down the capture pass yields nothing, and apply
 * still commits everything the log alone implies (scope refresh, deprecation) while
 * reporting each un-mirrored component in `mirrorSkipped`. Never a crash, never a silent
 * half-sync.
 *
 * Because deprecate ↔ un-deprecate are both derivable from the log, replaying the WHOLE
 * log over a base registry reproduces the correct final lifecycle state — a later
 * CREATE/UPDATE of a deleted component un-deprecates it. That is the "replayable view over
 * the log" undo path the spec asks for.
 */
import {
  RegistryError,
  registerComponent,
  type ComponentRecord,
  type ComponentScope,
  type Registry,
} from "./registry-store.js";
import type { PreviewDelta } from "./figma-reconcile.js";
import { figmaNodeRelPath, type FigmaNodeSpec } from "./figma-node-reader.js";
import { captureFor, materialize, type MirrorSkip } from "./figma-apply-mirror.js";
import type { MirrorIndex } from "./figma-mirror-capture.js";

/** A sidecar the caller must write (figma-node-reader.writeFigmaNode) before saving the registry. */
export interface SidecarWrite {
  name: string;
  node: FigmaNodeSpec;
}

/** What `applyDelta` actually did, by component name (all arrays sorted by the delta order). */
export interface ApplyReport {
  /** NEW records materialized from a captured node spec (spec 005 P4). */
  added: string[];
  /** Existing records set `deprecated: true` (a DELETE landed). */
  deprecated: string[];
  /** Existing records whose `scope`, `deprecated` and/or sidecar pointer refreshed. */
  updated: string[];
  /** Components whose node sidecar was captured and replaced 1:1 (⊇ added, overlaps updated). */
  mirrored: string[];
  /** ADD/EDIT components with no usable capture — the mirror did not run or the scan failed. */
  mirrorSkipped: MirrorSkip[];
  /** New components neither the log nor a capture can materialize — need `ui ingest-figma-ds`. */
  pending: { name: string; reason: string }[];
  /** A deprecate/update whose target name is not in the registry — nothing to write. */
  skipped: { name: string; reason: string }[];
}

/** Empty apply report (also the "nothing changed" shape). */
function emptyReport(): ApplyReport {
  return { added: [], deprecated: [], updated: [], mirrored: [], mirrorSkipped: [], pending: [], skipped: [] };
}

/** Count of registry records this report actually changed — the honest "synced" number. */
export function landedCount(r: ApplyReport): number {
  return r.added.length + r.updated.length + r.deprecated.length;
}

/**
 * Apply a preview-delta to a registry, returning the next registry, the sidecars to
 * write, and a report. Pure: the input registry is never mutated (registerComponent
 * returns a fresh copy each call). Idempotent — re-applying the same delta over the
 * result is a no-op (an unchanged record short-circuits; an identical sidecar is
 * content-guarded by the writer).
 *
 * @param mirror Captured node specs keyed by change-log nodeId. Omitted = the capture
 *               pass did not run (no plugin / a plain CLI apply) → mirror-less degrade.
 */
export function applyDelta(
  reg: Registry,
  delta: PreviewDelta,
  mirror?: MirrorIndex,
): { registry: Registry; report: ApplyReport; sidecarWrites: SidecarWrite[]; changed: boolean } {
  let registry = reg;
  let changed = false;
  const report = emptyReport();
  const sidecarWrites: SidecarWrite[] = [];

  // ── DELETE → soft-deprecate the existing record (never mirrored: it is gone) ──
  for (const e of delta.deprecated) {
    const existing = findByName(registry, e.name);
    if (existing === undefined) {
      report.skipped.push({ name: e.name, reason: "delete of a component not in the registry" });
      continue;
    }
    if (existing.deprecated === true) continue; // already deprecated — idempotent no-op
    registry = registerComponent(registry, { ...existing, deprecated: true }, true).registry;
    report.deprecated.push(e.name);
    changed = true;
  }

  // ── UPDATE → refresh scope, clear deprecation, replace the sidecar from the capture ──
  for (const e of delta.updated) {
    const existing = findByName(registry, e.name);
    if (existing === undefined) {
      // Should not happen (updated ⇒ prior existed), but stay defensive.
      report.skipped.push({ name: e.name, reason: "update of a component not in the registry" });
      continue;
    }
    const node = captureFor(e, mirror, report.mirrorSkipped);
    const nextScope = e.scope as ComponentScope;
    const pointer = node === undefined ? existing.figmaNode : figmaNodeRelPath(e.name);
    const recordChanged =
      (existing.scope ?? "local") !== nextScope ||
      existing.deprecated === true ||
      existing.figmaNode !== pointer;

    if (node !== undefined) {
      // Always re-write on a capture: the record can be identical while the node changed
      // (padding, fills…) — that is exactly the mirror this phase exists to keep 1:1.
      sidecarWrites.push({ name: e.name, node });
      report.mirrored.push(e.name);
    }
    if (!recordChanged) continue; // nothing the log + capture can faithfully change on the record
    const next: ComponentRecord = { ...existing, scope: nextScope };
    delete next.deprecated; // un-deprecate — Figma still has (and just touched) it
    if (pointer !== undefined) next.figmaNode = pointer;
    registry = registerComponent(registry, next, true).registry;
    report.updated.push(e.name);
    changed = true;
  }

  // ── ADD → materialize from the capture, else stay pending for re-ingest ───────
  for (const e of delta.added) {
    const node = captureFor(e, mirror, report.mirrorSkipped);
    if (node === undefined) {
      report.pending.push({
        name: e.name,
        reason: "new component — run `ui ingest-figma-ds` to materialize markup/tokens",
      });
      continue;
    }
    let rec: ComponentRecord;
    try {
      rec = materialize(e);
    } catch (err) {
      // A Figma node name the registry cannot key (not `Category/Variant`) — say so and
      // stay pending rather than inventing a name the designer never chose.
      if (!(err instanceof RegistryError)) throw err;
      report.pending.push({ name: e.name, reason: `captured but not registrable — ${err.message}` });
      continue;
    }
    registry = registerComponent(registry, rec, true).registry;
    sidecarWrites.push({ name: e.name, node });
    report.added.push(e.name);
    report.mirrored.push(e.name);
    changed = true;
  }

  return { registry, report, sidecarWrites, changed };
}

function findByName(reg: Registry, name: string): ComponentRecord | undefined {
  return reg.components.find((c) => c.name === name);
}
