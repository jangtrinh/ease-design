/**
 * Design-memory event model — the append-only ledger's typed vocabulary.
 *
 * The ledger (`design/memory.events.jsonl`) is the single source of truth: one
 * JSON event per line, never edited. This module owns the closed event-type set,
 * per-type `data` validation, and deterministic (de)serialisation. It is pure —
 * no fs, no clock; the impl layer assigns `t`/`id` and does the append.
 *
 * Storage invariant: the graph/profile are rebuildable views; only these events
 * are truth (plan §"Architecture invariants" #1).
 */

export const MEMORY_EVENT_VERSION = 1 as const;

export type Medium = "html" | "figma";
export const MEDIA: readonly Medium[] = ["html", "figma"];

/** Closed set of v1 event types. Unknown types are rejected with BAD_EVENT_TYPE. */
export const EVENT_TYPES = [
  "variant_generated",
  "rendition_created",
  "taste_verdict",
  "user_pick",
  "vibe_edit",
  "manual_edit",
  "token_change",
  "component_registered",
  "harvested",
  "duel_result",
  "insight",
  "gap",
  "lint_run",
  "autofix_applied",
  "reconcile_applied",
  "taste_vote",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Required `data` keys per type (extra keys allowed for forward compat). */
const REQUIRED_DATA: Readonly<Record<EventType, readonly string[]>> = {
  variant_generated: ["persona", "mode"],
  rendition_created: [],
  taste_verdict: ["scores", "lowestAxis", "round", "pass"],
  user_pick: ["chosen", "rejected"],
  vibe_edit: ["word", "axis"],
  manual_edit: ["summary"],
  token_change: ["path", "from", "to"],
  component_registered: ["name"],
  harvested: ["source"],
  duel_result: ["benchmark", "traits"],
  insight: ["text"],
  // A knowledge gap the librarian graduates: `text` describes the gap, `target`
  // names where it belongs (`<file>[#<section>]`, e.g. `taste-rubric.md#motion`).
  // `data.kind` is optional and unenforced (rubric-gap | persona-gap | recipe-gap |
  // benchmark-stale | guardrail-lesson). Unlike `insight`, `gap` needs no refs.
  gap: ["text", "target"],
  // ─── Auto-recorded outcomes (spec 006 P1) — appended by `recordOutcome`, never by hand.
  // A checker run: `check` names the tool (a11y-lint | content-lint | taste-lint |
  // validate-layout | audit), `checkIds` is the sorted unique set of rules that tripped.
  // `audit` maps total→errorCount, warningCount: 0 (it has no severity split).
  lint_run: ["check", "file", "errorCount", "warningCount", "checkIds"],
  // A `ui autofix --write` that CHANGED the file. A no-op autofix records nothing.
  autofix_applied: ["file", "fixCount", "ruleIds"],
  // A `ui figma reconcile --apply` that changed the registry and/or wrote sidecars.
  reconcile_applied: ["added", "updated", "deprecated"],
  // One `ui taste record --mode pair` vote. NOT `user_pick`: a corpus item id is not a
  // designId, and compileGraph would file it under `designs` (memory-graph.ts:93).
  taste_vote: ["a", "b", "winner"],
};

export interface MemoryArtifact {
  ref?: string;
  fingerprint?: string;
}

export interface MemoryEvent {
  v: typeof MEMORY_EVENT_VERSION;
  id: string;
  t: string; // ISO-8601 UTC (from --at or the system clock)
  type: EventType;
  actor?: string;
  medium?: Medium;
  designId?: string;
  artifact?: MemoryArtifact;
  refs?: string[];
  data: Record<string, unknown>;
}

export class MemoryEventError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryEventError";
    this.code = code;
  }
}

export function isEventType(t: string): t is EventType {
  return (EVENT_TYPES as readonly string[]).includes(t);
}

export function isMedium(m: string): m is Medium {
  return (MEDIA as readonly string[]).includes(m);
}

/** Monotonic id for the next appended event given the current line count. */
export function nextEventId(lineCount: number): string {
  return `e${lineCount + 1}`;
}

/**
 * Validate a type + data + refs triple. Throws MemoryEventError with:
 *   BAD_EVENT_TYPE — unknown type (not in the v1 closed set)
 *   BAD_EVENT      — a required `data` key is missing, or an `insight` carries no refs
 */
export function validateEvent(
  type: string,
  data: Record<string, unknown>,
  refs: readonly string[] | undefined,
): asserts type is EventType {
  if (!isEventType(type)) {
    throw new MemoryEventError(
      "BAD_EVENT_TYPE",
      `unknown event type '${type}'. Valid types: ${EVENT_TYPES.join(", ")}`,
    );
  }
  for (const key of REQUIRED_DATA[type]) {
    if (!(key in data)) {
      throw new MemoryEventError("BAD_EVENT", `event '${type}' requires data.${key}`);
    }
  }
  // Provenance rule: an insight must cite the events it was drawn from.
  if (type === "insight" && (refs === undefined || refs.length === 0)) {
    throw new MemoryEventError(
      "BAD_EVENT",
      "event 'insight' requires --refs (provenance): the event ids it was drawn from",
    );
  }
}

/**
 * Build a canonical event envelope. `data`/`refs` are validated before this is
 * called by the impl. Optional fields are omitted (not set to undefined) so the
 * serialised line is stable.
 */
export function buildEvent(input: {
  id: string;
  t: string;
  type: EventType;
  data: Record<string, unknown>;
  actor?: string;
  medium?: Medium;
  designId?: string;
  artifact?: MemoryArtifact;
  refs?: readonly string[];
}): MemoryEvent {
  const e: MemoryEvent = { v: MEMORY_EVENT_VERSION, id: input.id, t: input.t, type: input.type, data: input.data };
  if (input.actor !== undefined) e.actor = input.actor;
  if (input.medium !== undefined) e.medium = input.medium;
  if (input.designId !== undefined) e.designId = input.designId;
  if (input.artifact !== undefined && (input.artifact.ref !== undefined || input.artifact.fingerprint !== undefined)) {
    e.artifact = input.artifact;
  }
  if (input.refs !== undefined && input.refs.length > 0) e.refs = [...input.refs];
  return e;
}

/**
 * Serialise one event to a single JSONL line with a fixed key order, so the same
 * event always produces the same bytes.
 */
export function serializeEvent(e: MemoryEvent): string {
  const ordered: Record<string, unknown> = { v: e.v, id: e.id, t: e.t, type: e.type };
  if (e.actor !== undefined) ordered["actor"] = e.actor;
  if (e.medium !== undefined) ordered["medium"] = e.medium;
  if (e.designId !== undefined) ordered["designId"] = e.designId;
  if (e.artifact !== undefined) ordered["artifact"] = e.artifact;
  if (e.refs !== undefined) ordered["refs"] = e.refs;
  ordered["data"] = e.data;
  return JSON.stringify(ordered);
}

/**
 * Parse a full ledger text into events. Blank lines are skipped. An unparseable
 * or malformed line throws MemoryEventError("BAD_LEDGER") naming the 1-based line
 * number — the caller must never partial-write on this.
 */
export function parseLedger(text: string): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line.length === 0) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new MemoryEventError("BAD_LEDGER", `ledger line ${i + 1} is not valid JSON`);
    }
    if (obj === null || typeof obj !== "object") {
      throw new MemoryEventError("BAD_LEDGER", `ledger line ${i + 1} is not a JSON object`);
    }
    const o = obj as Record<string, unknown>;
    if (typeof o["id"] !== "string" || typeof o["t"] !== "string" || typeof o["type"] !== "string") {
      throw new MemoryEventError("BAD_LEDGER", `ledger line ${i + 1} is missing id/t/type`);
    }
    if (!isEventType(o["type"] as string)) {
      throw new MemoryEventError("BAD_LEDGER", `ledger line ${i + 1} has unknown type '${String(o["type"])}'`);
    }
    events.push({
      v: MEMORY_EVENT_VERSION,
      id: o["id"] as string,
      t: o["t"] as string,
      type: o["type"] as EventType,
      actor: typeof o["actor"] === "string" ? (o["actor"] as string) : undefined,
      medium: typeof o["medium"] === "string" && isMedium(o["medium"] as string) ? (o["medium"] as Medium) : undefined,
      designId: typeof o["designId"] === "string" ? (o["designId"] as string) : undefined,
      artifact: typeof o["artifact"] === "object" && o["artifact"] !== null ? (o["artifact"] as MemoryArtifact) : undefined,
      refs: Array.isArray(o["refs"]) ? (o["refs"] as string[]) : undefined,
      data: typeof o["data"] === "object" && o["data"] !== null ? (o["data"] as Record<string, unknown>) : {},
    });
  }
  return events;
}
