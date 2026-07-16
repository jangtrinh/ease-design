/**
 * Figma live-sync APPLY core (spec 004 P4, Tier 3 — deterministic, pure).
 *
 * Takes the P2 preview-delta (src/core/figma-reconcile.ts) plus the current
 * registry and returns the NEXT registry + a report of what changed. No fs, no
 * network, no LLM — the command layer (figma-reconcile-run.ts) owns all IO and the
 * cursor advance. Zero fabrication: apply writes only what the append-only log can
 * faithfully imply.
 *
 * What apply can faithfully write from the log alone:
 *   - deprecated (a DELETE)   → set `deprecated: true` on the existing record.
 *   - updated (a re-touch)    → refresh `scope` (a REMOTE-origin promotion) AND clear
 *                               any `deprecated` flag (the component is live again).
 *
 * What it deliberately does NOT write:
 *   - added (a brand-NEW component) → the log carries identity + scope but NOT the
 *     markup / tokens / category a ComponentRecord requires. Materializing a stub
 *     would fabricate content and risk empty-markup records crashing downstream
 *     emitters. Added components are reported `pending` — `ui ingest-figma-ds`
 *     supplies their real content. See spec 004 P4 executor note.
 *
 * Because deprecate ↔ un-deprecate are both derivable from the log, replaying the
 * WHOLE log over a base registry reproduces the correct final lifecycle state — a
 * later CREATE/UPDATE of a deleted component un-deprecates it. That is the
 * "replayable view over the log" undo path the spec asks for.
 */
import {
  registerComponent,
  type ComponentRecord,
  type ComponentScope,
  type Registry,
} from "./registry-store.js";
import type { PreviewDelta } from "./figma-reconcile.js";

/** What `applyDelta` actually did, by component name (all arrays sorted by the delta order). */
export interface ApplyReport {
  /** Existing records set `deprecated: true` (a DELETE landed). */
  deprecated: string[];
  /** Existing records whose `scope` and/or `deprecated` refreshed (a re-touch). */
  updated: string[];
  /** New components the log cannot materialize — need `ui ingest-figma-ds`. */
  pending: { name: string; reason: string }[];
  /** A deprecate/update whose target name is not in the registry — nothing to write. */
  skipped: { name: string; reason: string }[];
}

/** Empty apply report (also the "nothing changed" shape). */
function emptyReport(): ApplyReport {
  return { deprecated: [], updated: [], pending: [], skipped: [] };
}

/**
 * Apply a preview-delta to a registry, returning the next registry + a report.
 * Pure: the input registry is never mutated (registerComponent returns a fresh
 * copy each call). Idempotent — re-applying the same delta over the result is a
 * no-op (deprecate on an already-deprecated record, or a re-touch that changes
 * nothing, both short-circuit).
 */
export function applyDelta(
  reg: Registry,
  delta: PreviewDelta,
): { registry: Registry; report: ApplyReport; changed: boolean } {
  let registry = reg;
  let changed = false;
  const report = emptyReport();

  // ── DELETE → soft-deprecate the existing record ──────────────────────────────
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

  // ── UPDATE → refresh scope + clear any deprecation (re-touched = live again) ──
  for (const e of delta.updated) {
    const existing = findByName(registry, e.name);
    if (existing === undefined) {
      // Should not happen (updated ⇒ prior existed), but stay defensive.
      report.skipped.push({ name: e.name, reason: "update of a component not in the registry" });
      continue;
    }
    const nextScope = e.scope as ComponentScope;
    const scopeChanged = (existing.scope ?? "local") !== nextScope;
    const wasDeprecated = existing.deprecated === true;
    if (!scopeChanged && !wasDeprecated) continue; // nothing the log can faithfully change
    const next: ComponentRecord = { ...existing, scope: nextScope };
    delete next.deprecated; // un-deprecate — Figma still has (and just touched) it
    registry = registerComponent(registry, next, true).registry;
    report.updated.push(e.name);
    changed = true;
  }

  // ── ADD → cannot materialize markup/tokens from the log → pending re-ingest ───
  for (const e of delta.added) {
    report.pending.push({
      name: e.name,
      reason: "new component — run `ui ingest-figma-ds` to materialize markup/tokens",
    });
  }

  return { registry, report, changed };
}

function findByName(reg: Registry, name: string): ComponentRecord | undefined {
  return reg.components.find((c) => c.name === name);
}
