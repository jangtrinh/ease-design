/**
 * spec 005 P4 — the scoped mirror in `ui figma reconcile --apply --mirror-file`.
 *
 * Everything asserted here is the DETERMINISTIC half: a capture file in → sidecars,
 * registry pointers, and an honest report out. The live half (asking the plugin for each
 * node spec) happens in figma-agent's broker orchestration, outside the kernel by
 * constitution (Art I.2), and is proven on real Figma in P5.
 *
 * The degrade path is a first-class case, not an afterthought: with the plugin down there
 * is no capture, and apply must still land everything the log alone implies while naming
 * every component it could not mirror.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { coalesceFrames, computePreviewDelta } from "../src/core/figma-reconcile.js";
import type { ChangeFrame, RegistryView } from "../src/core/figma-reconcile.js";
import { applyDelta, landedCount } from "../src/core/figma-apply.js";
import { indexCaptures, parseMirrorCapture } from "../src/core/figma-mirror-capture.js";
import { readCursor, syncStatePath } from "../src/core/figma-sync-state.js";
import type { ComponentRecord, Registry } from "../src/core/registry-store.js";

// ─── fixture builders ──────────────────────────────────────────────────────────

function frame(over: Partial<ChangeFrame> = {}): ChangeFrame {
  return {
    v: 1, ts: 1000, op: "updated", nodeId: "1:1", nodeName: "Button/Primary",
    nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local",
    page: "Page 1", fileKey: "abc", ...over,
  };
}

function rec(over: Partial<ComponentRecord> & { name: string }): ComponentRecord {
  return { category: "Button", markup: "<button></button>", tokensUsed: [], scope: "local", ...over };
}

function registry(components: ComponentRecord[]): Registry {
  return { version: "0.1.0", components };
}

function viewOf(reg: Registry): ReadonlyMap<string, RegistryView> {
  return new Map(reg.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated }]));
}

function deltaOf(frames: ChangeFrame[], reg: Registry) {
  return computePreviewDelta(coalesceFrames(frames), viewOf(reg));
}

/** A minimal but REAL FigmaExportNode shape (type + name are the validated discriminant). */
function node(over: Record<string, unknown> = {}) {
  return { type: "FRAME", name: "Button/Primary", layoutMode: "VERTICAL", itemSpacing: 8, ...over };
}

function mirrorOf(captured: { nodeId: string; name: string; node: unknown }[], failed: unknown[] = []) {
  return indexCaptures(parseMirrorCapture(JSON.stringify({ v: 1, captured, failed }), "test"));
}

// ─── project fixture (command-level IO) ────────────────────────────────────────

let dir: string;

function project(frames: ChangeFrame[], reg: Registry): void {
  dir = mkdtempSync(join(tmpdir(), "ui-mirror-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "figma.changes.jsonl"), frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
  writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify(reg, null, 2));
}

function captureFile(payload: unknown): string {
  const path = join(dir, "capture.json");
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

function readRegistry(): Registry {
  return JSON.parse(readFileSync(join(dir, "design", "component-registry.json"), "utf8")) as Registry;
}

/** `run` writes to the real stdout and returns an exit code — capture it (cmd-test convention). */
function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { out += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyJson(extra: string[] = []): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(capture(["figma", "reconcile", "--apply", "--dir", dir, "--json", ...extra]).out) as Record<string, any>;
}

// ─── the pure transform ────────────────────────────────────────────────────────

describe("applyDelta with a mirror (spec 005 P4)", () => {
  it("EDIT: replaces the sidecar 1:1 and points the record at it", () => {
    const reg = registry([rec({ name: "Button/Primary" })]);
    const delta = deltaOf([frame({ op: "updated" })], reg);
    const mirror = mirrorOf([{ nodeId: "1:1", name: "Button/Primary", node: node({ itemSpacing: 24 }) }]);

    const { registry: next, report, sidecarWrites } = applyDelta(reg, delta, mirror);

    expect(report.mirrored).toEqual(["Button/Primary"]);
    expect(report.mirrorSkipped).toEqual([]);
    expect(sidecarWrites).toEqual([{ name: "Button/Primary", node: node({ itemSpacing: 24 }) }]);
    expect(next.components[0]?.figmaNode).toBe("components/button-primary.figma.json");
    // markup is one-way design→code — the mirror must never touch it.
    expect(next.components[0]?.markup).toBe("<button></button>");
  });

  it("EDIT: an unchanged record still re-writes the sidecar (the node moved, the record did not)", () => {
    const reg = registry([rec({ name: "Button/Primary", figmaNode: "components/button-primary.figma.json" })]);
    const delta = deltaOf([frame({ op: "updated" })], reg);
    const mirror = mirrorOf([{ nodeId: "1:1", name: "Button/Primary", node: node({ itemSpacing: 99 }) }]);

    const { report, sidecarWrites, changed } = applyDelta(reg, delta, mirror);

    expect(changed).toBe(false); // nothing on the record to change
    expect(report.updated).toEqual([]); // …so the report must not claim one
    expect(report.mirrored).toEqual(["Button/Primary"]); // …but the mirror DID land
    expect(sidecarWrites).toHaveLength(1);
  });

  it("ADD: materializes a record around the captured spec (markup stays empty)", () => {
    const reg = registry([]);
    const delta = deltaOf([frame({ op: "created", nodeName: "Card/Compact", nodeId: "2:9" })], reg);
    const mirror = mirrorOf([{ nodeId: "2:9", name: "Card/Compact", node: node({ name: "Card/Compact" }) }]);

    const { registry: next, report, sidecarWrites } = applyDelta(reg, delta, mirror);

    expect(report.added).toEqual(["Card/Compact"]);
    expect(report.pending).toEqual([]);
    expect(report.mirrored).toEqual(["Card/Compact"]);
    expect(sidecarWrites).toHaveLength(1);
    expect(next.components[0]).toMatchObject({
      name: "Card/Compact",
      category: "Card",
      markup: "",
      tokensUsed: [],
      scope: "local",
      figmaNode: "components/card-compact.figma.json",
    });
  });

  it("ADD: a name the registry cannot key stays pending, named — never invented", () => {
    const reg = registry([]);
    const delta = deltaOf([frame({ op: "created", nodeName: "untitled frame 12", nodeId: "3:3" })], reg);
    const mirror = mirrorOf([{ nodeId: "3:3", name: "untitled frame 12", node: node({ name: "untitled frame 12" }) }]);

    const { registry: next, report, sidecarWrites } = applyDelta(reg, delta, mirror);

    expect(next.components).toEqual([]);
    expect(sidecarWrites).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.pending[0]?.name).toBe("untitled frame 12");
    expect(report.pending[0]?.reason).toMatch(/captured but not registrable/);
  });

  it("ADD without any capture stays pending (spec 004 behaviour is preserved)", () => {
    const reg = registry([]);
    const delta = deltaOf([frame({ op: "created", nodeName: "Card/Compact", nodeId: "2:9" })], reg);

    const { registry: next, report } = applyDelta(reg, delta);

    expect(next.components).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.pending[0]?.reason).toMatch(/ingest-figma-ds/);
  });

  it("DELETE is never mirrored — a deleted node has nothing to scan", () => {
    const reg = registry([rec({ name: "Button/Primary" })]);
    const delta = deltaOf([frame({ op: "deleted" })], reg);

    const { registry: next, report, sidecarWrites } = applyDelta(reg, delta, mirrorOf([]));

    expect(report.deprecated).toEqual(["Button/Primary"]);
    expect(report.mirrored).toEqual([]);
    expect(report.mirrorSkipped).toEqual([]); // a DELETE is not a missed mirror
    expect(sidecarWrites).toEqual([]);
    expect(next.components[0]?.deprecated).toBe(true);
  });

  it("landedCount counts records changed, never log events", () => {
    const reg = registry([rec({ name: "Button/Primary" })]);
    const delta = deltaOf(
      [
        frame({ op: "updated", ts: 1 }),
        frame({ op: "updated", ts: 2, changedProps: ["fills"] }),
        frame({ op: "deleted", nodeId: "9:9", nodeName: "Card/Compact", ts: 3 }),
      ],
      reg,
    );
    const { report } = applyDelta(reg, delta, mirrorOf([]));

    // 3 log frames in; the delete targets an unknown name and the update changes nothing.
    expect(landedCount(report)).toBe(0);
    expect(report.skipped).toHaveLength(1);
  });
});

// ─── the degrade path (plugin down / scan failed) ──────────────────────────────

describe("mirror degrade (spec 005 P4)", () => {
  it("a failed scan names the reason and still applies the log-only half", () => {
    const reg = registry([rec({ name: "Button/Primary", scope: "local" })]);
    const delta = deltaOf([frame({ op: "updated", scopeHint: "global", origin: "REMOTE" })], reg);
    const mirror = mirrorOf([], [{ nodeId: "1:1", name: "Button/Primary", reason: "node not found: 1:1" }]);

    const { registry: next, report, sidecarWrites } = applyDelta(reg, delta, mirror);

    expect(sidecarWrites).toEqual([]);
    expect(report.mirrored).toEqual([]);
    expect(report.mirrorSkipped[0]?.reason).toMatch(/scan failed — node not found/);
    // the deterministic half still lands:
    expect(report.updated).toEqual(["Button/Primary"]);
    expect(next.components[0]?.scope).toBe("global");
  });

  it("no capture pass at all → every ADD/EDIT is reported un-mirrored (plugin down)", () => {
    const reg = registry([rec({ name: "Button/Primary" })]);
    const delta = deltaOf([frame({ op: "deleted", nodeId: "1:1" }), frame({ op: "updated", nodeId: "2:2", nodeName: "Card/Compact", ts: 2 })], reg);

    const { report } = applyDelta(reg, delta);

    expect(report.mirrorSkipped[0]?.reason).toMatch(/no capture in this apply \(plugin down\?\)/);
    expect(report.deprecated).toEqual(["Button/Primary"]); // the DELETE still landed
  });

  it("a capture superseding an earlier failure for the same node keeps the real data", () => {
    const idx = indexCaptures(
      parseMirrorCapture(
        JSON.stringify({
          v: 1,
          captured: [{ nodeId: "1:1", name: "Button/Primary", node: node() }],
          failed: [{ nodeId: "1:1", name: "Button/Primary", reason: "timed out" }],
        }),
        "test",
      ),
    );
    expect(idx.specs.has("1:1")).toBe(true);
    expect(idx.failures.has("1:1")).toBe(false);
  });
});

// ─── the capture-file contract ─────────────────────────────────────────────────

describe("parseMirrorCapture", () => {
  it("rejects a wrong version", () => {
    expect(() => parseMirrorCapture(JSON.stringify({ v: 99, captured: [], failed: [] }), "t")).toThrow(
      /unsupported version 99/,
    );
  });

  it("rejects a node that is not a FigmaExportNode", () => {
    const raw = JSON.stringify({ v: 1, captured: [{ nodeId: "1:1", name: "A/B", node: { type: "WIDGET", name: "x" } }], failed: [] });
    expect(() => parseMirrorCapture(raw, "t")).toThrow(/node\.type 'WIDGET' must be one of/);
  });

  it("rejects malformed JSON and missing arrays", () => {
    expect(() => parseMirrorCapture("{oops", "t")).toThrow(/not valid JSON/);
    expect(() => parseMirrorCapture(JSON.stringify({ v: 1, failed: [] }), "t")).toThrow(/'captured' must be an array/);
  });

  it("requires a reason on every failure — a nameless skip is not a report", () => {
    const raw = JSON.stringify({ v: 1, captured: [], failed: [{ nodeId: "1:1", name: "A/B" }] });
    expect(() => parseMirrorCapture(raw, "t")).toThrow(/failed\[0\]\.reason/);
  });
});

// ─── the command (IO: sidecar file, registry, cursor) ──────────────────────────

describe("ui figma reconcile --apply --mirror-file", () => {
  beforeEach(() => {
    dir = "";
  });

  it("writes the sidecar file and the registry pointer", () => {
    project([frame({ op: "updated" })], registry([rec({ name: "Button/Primary" })]));
    const file = captureFile({ v: 1, captured: [{ nodeId: "1:1", name: "Button/Primary", node: node({ itemSpacing: 24 }) }], failed: [] });

    const env = applyJson(["--mirror-file", file]);

    expect(env.ok).toBe(true);
    expect(env.data.apply.mirrored).toEqual(["Button/Primary"]);
    const sidecar = JSON.parse(readFileSync(join(dir, "design", "components", "button-primary.figma.json"), "utf8"));
    expect(sidecar).toMatchObject({ version: "0.1.0", name: "Button/Primary", node: { itemSpacing: 24 } });
    expect(readRegistry().components[0]?.figmaNode).toBe("components/button-primary.figma.json");
    expect(readCursor(syncStatePath(dir))).toBe(1);
  });

  it("ADD: creates the record + its sidecar in one apply", () => {
    project([frame({ op: "created", nodeName: "Card/Compact", nodeId: "2:9" })], registry([]));
    const file = captureFile({ v: 1, captured: [{ nodeId: "2:9", name: "Card/Compact", node: node({ name: "Card/Compact" }) }], failed: [] });

    const env = applyJson(["--mirror-file", file]);

    expect(env.data.apply.added).toEqual(["Card/Compact"]);
    expect(existsSync(join(dir, "design", "components", "card-compact.figma.json"))).toBe(true);
    expect(readRegistry().components[0]?.figmaNode).toBe("components/card-compact.figma.json");
  });

  it("plugin down (no --mirror-file): commits the log-only half, does not crash, reports the skip", () => {
    project([frame({ op: "deleted" })], registry([rec({ name: "Button/Primary" })]));

    const env = applyJson();

    expect(env.ok).toBe(true);
    expect(env.data.apply.deprecated).toEqual(["Button/Primary"]);
    expect(readRegistry().components[0]?.deprecated).toBe(true);
    expect(existsSync(join(dir, "design", "components"))).toBe(false); // no sidecars written
  });

  it("scan-fail path: scope/deprecate still land while the mirror is skipped, named", () => {
    project(
      [frame({ op: "updated", scopeHint: "global", origin: "REMOTE" }), frame({ op: "deleted", nodeId: "5:5", nodeName: "Card/Compact", ts: 2 })],
      registry([rec({ name: "Button/Primary" }), rec({ name: "Card/Compact", category: "Card" })]),
    );
    const file = captureFile({ v: 1, captured: [], failed: [{ nodeId: "1:1", name: "Button/Primary", reason: "plugin timed out" }] });

    const env = applyJson(["--mirror-file", file]);

    expect(env.ok).toBe(true);
    expect(env.data.apply.mirrored).toEqual([]);
    expect(env.data.apply.mirrorSkipped[0].reason).toMatch(/plugin timed out/);
    expect(env.data.apply.updated).toEqual(["Button/Primary"]);
    expect(env.data.apply.deprecated).toEqual(["Card/Compact"]);
    const out = readRegistry();
    expect(out.components.find((c) => c.name === "Button/Primary")?.scope).toBe("global");
    expect(out.components.find((c) => c.name === "Card/Compact")?.deprecated).toBe(true);
  });

  it("a corrupt capture file fails the apply loudly, committing nothing", () => {
    project([frame({ op: "updated" })], registry([rec({ name: "Button/Primary" })]));
    const file = captureFile({ v: 1, captured: [{ nodeId: "1:1", name: "B/P", node: { type: "WIDGET", name: "x" } }], failed: [] });

    const env = applyJson(["--mirror-file", file]);

    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("BAD_MIRROR_CAPTURE");
    expect(readCursor(syncStatePath(dir))).toBe(0); // cursor unmoved — the slice is retried
  });

  it("a missing capture file is an error, not a silent mirror-less apply", () => {
    project([frame({ op: "updated" })], registry([rec({ name: "Button/Primary" })]));

    const env = applyJson(["--mirror-file", join(dir, "nope.json")]);

    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("READ_ERROR");
  });

  it("rejects --mirror-file on a dry-run (a preview writes no sidecars)", () => {
    project([frame()], registry([rec({ name: "Button/Primary" })]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--json", "--mirror-file", "x.json"]).out) as Record<string, any>;

    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("BAD_ARG");
  });

  it("is idempotent: a second apply of the same capture rewrites nothing", () => {
    project([frame({ op: "updated" })], registry([rec({ name: "Button/Primary" })]));
    const file = captureFile({ v: 1, captured: [{ nodeId: "1:1", name: "Button/Primary", node: node() }], failed: [] });

    applyJson(["--mirror-file", file]);
    const first = readFileSync(join(dir, "design", "components", "button-primary.figma.json"), "utf8");
    const second = applyJson(["--mirror-file", file]);

    // The cursor consumed the slice, so the second apply sees an empty delta.
    expect(second.data.apply.mirrored).toEqual([]);
    expect(readFileSync(join(dir, "design", "components", "button-primary.figma.json"), "utf8")).toBe(first);
  });

  it("the text render reports what landed, not how many events arrived", () => {
    project(
      [frame({ ts: 1 }), frame({ ts: 2, changedProps: ["fills"] }), frame({ ts: 3, changedProps: ["cornerRadius"] })],
      registry([rec({ name: "Button/Primary", figmaNode: "components/button-primary.figma.json" })]),
    );
    const file = captureFile({ v: 1, captured: [{ nodeId: "1:1", name: "Button/Primary", node: node() }], failed: [] });

    const res = capture(["figma", "reconcile", "--apply", "--dir", dir, "--mirror-file", file]);

    // 3 log events, 1 component, 0 record changes, 1 mirrored.
    expect(res.out).toContain("0 added · 0 updated · 0 deprecated · 1 mirrored");
  });
});
