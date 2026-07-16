/**
 * spec 004 P4 — `ui figma reconcile --apply`: the deterministic commit path.
 *
 * Everything is verifiable from hand-written fixtures (Art III mechanism check; the
 * live Figma dogfood runs separately). Covers the pure applyDelta transform and the
 * command IO: registry write, cursor advance, idempotence, replay-composition, and
 * the "un-deprecate via replay" undo property.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { coalesceFrames, computePreviewDelta } from "../src/core/figma-reconcile.js";
import type { ChangeFrame, RegistryView } from "../src/core/figma-reconcile.js";
import { applyDelta } from "../src/core/figma-apply.js";
import { readCursor, syncStatePath } from "../src/core/figma-sync-state.js";
import { createEmptyRegistry, type ComponentRecord, type Registry } from "../src/core/registry-store.js";

// ─── fixture builders ──────────────────────────────────────────────────────────

function frame(over: Partial<ChangeFrame> = {}): ChangeFrame {
  return {
    v: 1, ts: 1000, op: "updated", nodeId: "1:1", nodeName: "Button/Primary",
    nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local",
    page: "Page 1", fileKey: "abc", ...over,
  };
}

function jsonl(frames: ChangeFrame[]): string {
  return frames.map((f) => JSON.stringify(f)).join("\n") + "\n";
}

function rec(over: Partial<ComponentRecord> & { name: string }): ComponentRecord {
  return { category: "button", markup: "<button></button>", tokensUsed: [], scope: "local", ...over };
}

function registry(components: ComponentRecord[]): Registry {
  return { version: "0.1.0", components };
}

function viewOf(reg: Registry): ReadonlyMap<string, RegistryView> {
  return new Map(reg.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated }]));
}

function deltaOf(reg: Registry, frames: ChangeFrame[], since = 0) {
  return computePreviewDelta(coalesceFrames(frames.slice(since)), viewOf(reg));
}

// ─── pure: applyDelta ────────────────────────────────────────────────────────

describe("figma-apply — applyDelta", () => {
  it("soft-deprecates a deleted component (existing record)", () => {
    const reg = registry([rec({ name: "Card/Basic" })]);
    const delta = deltaOf(reg, [frame({ op: "deleted", nodeName: "Card/Basic", nodeId: "c" })]);
    const { registry: next, report, changed } = applyDelta(reg, delta);
    expect(changed).toBe(true);
    expect(report.deprecated).toEqual(["Card/Basic"]);
    expect(next.components[0]!.deprecated).toBe(true);
  });

  it("un-deprecates + promotes scope on a re-touch (updated)", () => {
    const reg = registry([rec({ name: "Lib/Btn", deprecated: true, scope: "local" })]);
    const delta = deltaOf(reg, [frame({ op: "updated", nodeName: "Lib/Btn", nodeId: "b", scopeHint: "global", origin: "REMOTE" })]);
    const { registry: next, report } = applyDelta(reg, delta);
    expect(report.updated).toEqual(["Lib/Btn"]);
    expect(next.components[0]!.deprecated).toBeUndefined(); // cleared — live again
    expect(next.components[0]!.scope).toBe("global"); // REMOTE hint promoted
  });

  it("reports a brand-new component as pending (never fabricates markup)", () => {
    const reg = createEmptyRegistry();
    const delta = deltaOf(reg, [frame({ op: "created", nodeName: "Badge/New", nodeId: "n" })]);
    const { registry: next, report, changed } = applyDelta(reg, delta);
    expect(changed).toBe(false);
    expect(next.components.length).toBe(0); // registry NOT polluted with an empty stub
    expect(report.pending.map((p) => p.name)).toEqual(["Badge/New"]);
  });

  it("skips a delete/update of a name not in the registry", () => {
    const reg = createEmptyRegistry();
    const delta = deltaOf(reg, [frame({ op: "deleted", nodeName: "Ghost/Gone", nodeId: "g" })]);
    const { report, changed } = applyDelta(reg, delta);
    expect(changed).toBe(false);
    // A delete of an unknown name buckets as deprecated in the delta but skips on apply.
    expect(report.skipped.map((s) => s.name)).toEqual(["Ghost/Gone"]);
  });

  it("is idempotent — re-applying the same delta changes nothing", () => {
    const reg = registry([rec({ name: "Card/Basic" })]);
    const delta = deltaOf(reg, [frame({ op: "deleted", nodeName: "Card/Basic", nodeId: "c" })]);
    const once = applyDelta(reg, delta).registry;
    const twice = applyDelta(once, deltaOf(once, [frame({ op: "deleted", nodeName: "Card/Basic", nodeId: "c" })]));
    expect(twice.changed).toBe(false);
    expect(twice.registry).toEqual(once);
  });

  it("replay-composition: full apply == two-segment apply (deterministic view over the log)", () => {
    const reg = registry([rec({ name: "Nav/Bar", scope: "local" })]);
    const frames = [
      frame({ ts: 1, op: "deleted", nodeName: "Nav/Bar", nodeId: "n" }),
      frame({ ts: 2, op: "updated", nodeName: "Nav/Bar", nodeId: "n2", scopeHint: "global", origin: "REMOTE" }),
    ];
    // full replay [0..2)
    const full = applyDelta(reg, deltaOf(reg, frames)).registry;
    // segmented: [0..1) then [1..2)
    const seg1 = applyDelta(reg, deltaOf(reg, frames.slice(0, 1))).registry;
    const seg2 = applyDelta(seg1, computePreviewDelta(coalesceFrames(frames.slice(1)), viewOf(seg1))).registry;
    expect(seg2).toEqual(full);
  });

  it("un-deprecate via replay: a delete then a later re-touch nets to NOT deprecated", () => {
    const reg = registry([rec({ name: "Nav/Bar" })]);
    // Two separate frames (cross-batch): delete, then a later update → coalesce keeps
    // deleted (higher rank), BUT the full-log final state models the live doc: the
    // component still exists. We apply each in ORDER to reproduce the ledger's undo.
    const del = applyDelta(reg, deltaOf(reg, [frame({ ts: 1, op: "deleted", nodeName: "Nav/Bar", nodeId: "n" })])).registry;
    expect(del.components[0]!.deprecated).toBe(true);
    const back = applyDelta(del, computePreviewDelta(
      coalesceFrames([frame({ ts: 2, op: "updated", nodeName: "Nav/Bar", nodeId: "n" })]),
      viewOf(del),
    )).registry;
    expect(back.components[0]!.deprecated).toBeUndefined(); // replayed re-touch un-deprecates
  });
});

// ─── command ─────────────────────────────────────────────────────────────────

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

let dir: string;
function writeLog(frames: ChangeFrame[]): void {
  writeFileSync(join(dir, "design", "figma.changes.jsonl"), jsonl(frames), "utf8");
}
function writeRegistry(components: Array<Record<string, unknown>>): void {
  writeFileSync(
    join(dir, "design", "component-registry.json"),
    JSON.stringify({ version: "0.1.0", components }, null, 2) + "\n",
    "utf8",
  );
}
function readReg(): Registry {
  return JSON.parse(readFileSync(join(dir, "design", "component-registry.json"), "utf8"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-fig-apply-"));
  mkdirSync(join(dir, "design"), { recursive: true });
});

describe("ui figma reconcile --apply — command", () => {
  it("soft-deprecates a delete, writes the registry, advances the cursor", () => {
    writeRegistry([{ name: "Card/Basic", category: "card", markup: "<div></div>", tokensUsed: [], scope: "local" }]);
    writeLog([frame({ op: "deleted", nodeName: "Card/Basic", nodeId: "c" })]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(env.data.applied).toBe(true);
    expect(env.data.dry_run).toBe(false);
    expect(env.data.apply.deprecated).toEqual(["Card/Basic"]);
    // registry mutated on disk
    expect(readReg().components[0]!.deprecated).toBe(true);
    // cursor advanced to log end
    expect(readCursor(syncStatePath(dir))).toBe(1);
    expect(env.data.cursor_to).toBe(1);
  });

  it("--apply is idempotent: a second run is a no-op (registry byte-identical)", () => {
    writeRegistry([{ name: "Card/Basic", category: "card", markup: "<div></div>", tokensUsed: [], scope: "local" }]);
    writeLog([frame({ op: "deleted", nodeName: "Card/Basic", nodeId: "c" })]);
    capture(["figma", "reconcile", "--dir", dir, "--apply", "--json"]);
    const after1 = readFileSync(join(dir, "design", "component-registry.json"), "utf8");
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--json"]);
    const env = JSON.parse(out);
    expect(env.data.cursor_from).toBe(1); // resumed from the persisted cursor
    expect(env.data.cursor_to).toBe(1);
    expect(env.data.apply.deprecated).toEqual([]); // nothing new
    expect(readFileSync(join(dir, "design", "component-registry.json"), "utf8")).toBe(after1);
  });

  it("new components stay pending — registry is not polluted with empty stubs", () => {
    writeRegistry([]);
    writeLog([frame({ op: "created", nodeName: "Badge/New", nodeId: "n" })]);
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--json"]);
    const env = JSON.parse(out);
    expect(env.data.apply.pending.map((p: { name: string }) => p.name)).toEqual(["Badge/New"]);
    expect(readReg().components.length).toBe(0);
    expect(readCursor(syncStatePath(dir))).toBe(1); // cursor still advances (change was seen)
  });

  it("rejects --apply combined with --dry-run (BAD_ARG)", () => {
    writeRegistry([]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--dry-run", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_ARG");
  });

  it("--since replays a prior cursor without touching the persisted cursor's start", () => {
    writeRegistry([{ name: "One/A", category: "c", markup: "", tokensUsed: [], scope: "local" }]);
    writeLog([
      frame({ nodeId: "a", op: "deleted", nodeName: "One/A" }),
      frame({ nodeId: "b", op: "created", nodeName: "Two/B" }),
    ]);
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--since", "0", "--json"]);
    const env = JSON.parse(out);
    expect(env.data.cursor_from).toBe(0);
    expect(env.data.cursor_to).toBe(2);
    expect(env.data.apply.deprecated).toEqual(["One/A"]);
    expect(readCursor(syncStatePath(dir))).toBe(2); // advanced to end after replay
  });
});
