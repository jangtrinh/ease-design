/**
 * spec 004 P2 — `ui figma reconcile --dry-run`: pure reconcile core + command.
 *
 * The whole contract is verifiable from hand-written fixtures — no live Figma needed
 * (Art III mechanism check; the real-data dogfood runs separately). Fixtures cover
 * created / updated / deleted, cross-batch coalesce, scope mapping, injection-as-data,
 * and a malformed ledger.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import {
  parseChangeLog,
  coalesceFrames,
  computePreviewDelta,
  scopeSummary,
  ReconcileError,
} from "../src/core/figma-reconcile.js";
import type { ChangeFrame, RegistryView } from "../src/core/figma-reconcile.js";

// ─── fixture builders ──────────────────────────────────────────────────────────

function frame(over: Partial<ChangeFrame> = {}): ChangeFrame {
  return {
    v: 1,
    ts: 1000,
    op: "updated",
    nodeId: "1:1",
    nodeName: "Button/Primary",
    nodeType: "COMPONENT",
    changedProps: [],
    origin: "LOCAL",
    scopeHint: "local",
    page: "Page 1",
    fileKey: "abc",
    ...over,
  };
}

function jsonl(frames: ChangeFrame[]): string {
  return frames.map((f) => JSON.stringify(f)).join("\n") + "\n";
}

function registryView(names: Array<Partial<RegistryView> & { name: string }>): ReadonlyMap<string, RegistryView> {
  return new Map(names.map((n) => [n.name, { scope: "local", ...n }]));
}

// ─── pure: parseChangeLog ────────────────────────────────────────────────────

describe("figma-reconcile — parseChangeLog", () => {
  it("parses valid lines and ignores blanks", () => {
    const raw = jsonl([frame({ nodeId: "1:1" }), frame({ nodeId: "1:2" })]) + "\n   \n";
    const frames = parseChangeLog(raw);
    expect(frames.length).toBe(2);
    expect(frames[0]!.nodeId).toBe("1:1");
  });

  it("throws BAD_CHANGE_LOG on malformed JSON", () => {
    expect(() => parseChangeLog('{"v":1,"op":"created"\n')).toThrowError(ReconcileError);
    try {
      parseChangeLog("{not json}\n");
    } catch (e) {
      expect((e as ReconcileError).code).toBe("BAD_CHANGE_LOG");
    }
  });

  it("throws BAD_CHANGE_LOG on wrong schema version", () => {
    const bad = JSON.stringify(frame({ v: 2 })) + "\n";
    expect(() => parseChangeLog(bad)).toThrowError(/schema version 2/);
  });

  it("throws BAD_CHANGE_LOG on a missing required field", () => {
    const bad = '{"v":1,"ts":1,"op":"updated","nodeName":"X","nodeType":"COMPONENT","changedProps":[],"origin":"LOCAL","scopeHint":"local","page":"p","fileKey":null}\n';
    try {
      parseChangeLog(bad);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReconcileError);
      expect((e as ReconcileError).code).toBe("BAD_CHANGE_LOG");
    }
  });
});

// ─── pure: coalesceFrames ────────────────────────────────────────────────────

describe("figma-reconcile — coalesceFrames (cross-batch)", () => {
  it("deletion supersedes an earlier update; props unioned; last non-null name wins", () => {
    const out = coalesceFrames([
      frame({ nodeId: "1:1", ts: 100, op: "updated", changedProps: ["fills"], nodeName: "Button/Primary" }),
      frame({ nodeId: "1:1", ts: 200, op: "updated", changedProps: ["cornerRadius"], nodeName: "Button/Renamed" }),
      frame({ nodeId: "1:1", ts: 300, op: "deleted", changedProps: [], nodeName: null }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0]!.op).toBe("deleted");
    expect(out[0]!.changedProps).toEqual(["cornerRadius", "fills"]);
    expect(out[0]!.nodeName).toBe("Button/Renamed"); // delete's null did not clobber the known name
  });

  it("creation outranks a later update; a global hint promotes", () => {
    const out = coalesceFrames([
      frame({ nodeId: "2:2", ts: 100, op: "created", scopeHint: "local" }),
      frame({ nodeId: "2:2", ts: 200, op: "updated", scopeHint: "global" }),
    ]);
    expect(out[0]!.op).toBe("created");
    expect(out[0]!.scopeHint).toBe("global");
  });

  it("is deterministic — output sorted by nodeId", () => {
    const out = coalesceFrames([frame({ nodeId: "9:9" }), frame({ nodeId: "1:1" })]);
    expect(out.map((c) => c.nodeId)).toEqual(["1:1", "9:9"]);
  });
});

// ─── pure: computePreviewDelta + scope ───────────────────────────────────────

describe("figma-reconcile — computePreviewDelta", () => {
  it("buckets by op × registry presence and maps name→field", () => {
    const existing = registryView([{ name: "Button/Primary" }, { name: "Card/Basic" }]);
    const delta = computePreviewDelta(
      coalesceFrames([
        frame({ nodeId: "a", op: "created", nodeName: "Badge/New" }), // new name → added
        frame({ nodeId: "b", op: "updated", nodeName: "Button/Primary", changedProps: ["name", "fills"] }), // existing → updated
        frame({ nodeId: "c", op: "deleted", nodeName: "Card/Basic" }), // existing → deprecated
      ]),
      existing,
    );
    expect(delta.added.map((e) => e.name)).toEqual(["Badge/New"]);
    expect(delta.deprecated.map((e) => e.name)).toEqual(["Card/Basic"]);
    const upd = delta.updated[0]!;
    expect(upd.name).toBe("Button/Primary");
    expect(upd.fields).toEqual(["name"]); // name maps; fills → null (not a discrete field)
    expect(upd.changedProps).toEqual([
      { figmaProp: "fills", field: null },
      { figmaProp: "name", field: "name" },
    ]);
  });

  it("created-existing folds to updated; updated-missing folds to added", () => {
    const existing = registryView([{ name: "Button/Primary" }]);
    const delta = computePreviewDelta(
      coalesceFrames([
        frame({ nodeId: "a", op: "created", nodeName: "Button/Primary" }), // exists → updated
        frame({ nodeId: "b", op: "updated", nodeName: "Nav/Bar" }), // missing → added
      ]),
      existing,
    );
    expect(delta.updated.map((e) => e.name)).toEqual(["Button/Primary"]);
    expect(delta.added.map((e) => e.name)).toEqual(["Nav/Bar"]);
  });

  it("a delete with no resolvable name is unresolved, not deprecated", () => {
    const delta = computePreviewDelta(
      coalesceFrames([frame({ nodeId: "z", op: "deleted", nodeName: null })]),
      registryView([]),
    );
    expect(delta.deprecated.length).toBe(0);
    expect(delta.unresolved.length).toBe(1);
    expect(delta.unresolved[0]!.nodeId).toBe("z");
  });

  it("scope: hint drives new; promotes local→global; never demotes a known-global", () => {
    // new component takes the hint verbatim
    const d1 = computePreviewDelta(coalesceFrames([frame({ nodeId: "a", op: "created", nodeName: "Lib/A", scopeHint: "global" })]), registryView([]));
    expect(d1.added[0]!.scope).toBe("global");
    expect(d1.added[0]!.scopeFromHint).toBe(true);

    // existing local + global hint → promoted
    const d2 = computePreviewDelta(
      coalesceFrames([frame({ nodeId: "b", op: "updated", nodeName: "Lib/B", scopeHint: "global" })]),
      registryView([{ name: "Lib/B", scope: "local" }]),
    );
    expect(d2.updated[0]!.scope).toBe("global");
    expect(d2.updated[0]!.scopeFromHint).toBe(true);

    // existing global + local hint → stays global, not from hint
    const d3 = computePreviewDelta(
      coalesceFrames([frame({ nodeId: "c", op: "updated", nodeName: "Lib/C", scopeHint: "local" })]),
      registryView([{ name: "Lib/C", scope: "global" }]),
    );
    expect(d3.updated[0]!.scope).toBe("global");
    expect(d3.updated[0]!.scopeFromHint).toBe(false);
  });

  it("scopeSummary counts resolved scopes across all applied buckets", () => {
    const delta = computePreviewDelta(
      coalesceFrames([
        frame({ nodeId: "a", op: "created", nodeName: "L/A", scopeHint: "local" }),
        frame({ nodeId: "b", op: "created", nodeName: "G/B", scopeHint: "global" }),
      ]),
      registryView([]),
    );
    expect(scopeSummary(delta)).toEqual({ local: 1, global: 1 });
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-fig-"));
  mkdirSync(join(dir, "design"), { recursive: true });
});

describe("ui figma reconcile — command", () => {
  it("previews created/updated/deprecated against a registry (exit 0, JSON shape)", () => {
    writeRegistry([
      { name: "Button/Primary", category: "button", markup: "<button></button>", tokensUsed: ["color.primary"], scope: "local" },
      { name: "Card/Basic", category: "card", markup: "<div></div>", tokensUsed: [], scope: "local" },
    ]);
    writeLog([
      frame({ nodeId: "a", op: "created", nodeName: "Badge/New" }),
      frame({ nodeId: "b", op: "updated", nodeName: "Button/Primary", changedProps: ["name"] }),
      frame({ nodeId: "c", op: "deleted", nodeName: "Card/Basic" }),
    ]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--dry-run", "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("figma reconcile");
    expect(env.data.dry_run).toBe(true);
    expect(env.data.cursor_from).toBe(0);
    expect(env.data.cursor_to).toBe(3);
    expect(env.data.delta.added.map((e: { name: string }) => e.name)).toEqual(["Badge/New"]);
    expect(env.data.delta.updated.map((e: { name: string }) => e.name)).toEqual(["Button/Primary"]);
    expect(env.data.delta.deprecated.map((e: { name: string }) => e.name)).toEqual(["Card/Basic"]);
    expect(env.data.scope_summary).toEqual({ local: 3, global: 0 });
  });

  it("coalesces cross-batch before previewing", () => {
    writeRegistry([]);
    writeLog([
      frame({ nodeId: "x", ts: 1, op: "created", nodeName: "Menu/Item" }),
      frame({ nodeId: "x", ts: 2, op: "updated", nodeName: "Menu/Item", changedProps: ["fills"] }),
      frame({ nodeId: "x", ts: 3, op: "deleted", nodeName: "Menu/Item" }),
    ]);
    const env = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--json"]).out);
    // one component, coalesced to deleted → deprecated
    expect(env.data.delta.added.length).toBe(0);
    expect(env.data.delta.deprecated.map((e: { name: string }) => e.name)).toEqual(["Menu/Item"]);
    expect(env.data.cursor_to).toBe(3);
  });

  it("treats injected text as data — envelope stays valid JSON", () => {
    writeRegistry([]);
    const evil = 'Evil/Name","injected":true,"x":"\n{"ok":false}';
    writeLog([frame({ nodeId: "a", op: "created", nodeName: evil })]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out); // would throw if the injection broke the envelope
    expect(env.ok).toBe(true);
    expect(env.data.delta.added[0].name).toBe(evil); // preserved verbatim as data
  });

  it("BAD_CHANGE_LOG on a malformed ledger (exit 1)", () => {
    writeRegistry([]);
    writeFileSync(join(dir, "design", "figma.changes.jsonl"), "{not valid json}\n", "utf8");
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--json"]);
    expect(code).toBe(1);
    const env = JSON.parse(out);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("BAD_CHANGE_LOG");
  });

  it("absent log → empty delta, exit 0", () => {
    writeRegistry([]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.data.cursor_to).toBe(0);
    expect(env.data.delta.added.length).toBe(0);
  });

  it("absent registry → every component previews as added", () => {
    writeLog([frame({ nodeId: "a", op: "updated", nodeName: "Solo/One" })]);
    const env = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--json"]).out);
    expect(env.data.delta.added.map((e: { name: string }) => e.name)).toEqual(["Solo/One"]);
  });

  it("--since slices the log by line-count cursor", () => {
    writeRegistry([]);
    writeLog([
      frame({ nodeId: "a", op: "created", nodeName: "One/A" }),
      frame({ nodeId: "b", op: "created", nodeName: "Two/B" }),
      frame({ nodeId: "c", op: "created", nodeName: "Three/C" }),
    ]);
    const env = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--since", "2", "--json"]).out);
    expect(env.data.cursor_from).toBe(2);
    expect(env.data.cursor_to).toBe(3);
    expect(env.data.delta.added.map((e: { name: string }) => e.name)).toEqual(["Three/C"]);
  });

  it("--since must be a non-negative integer (BAD_ARG)", () => {
    writeRegistry([]);
    const { code, out } = capture(["figma", "reconcile", "--dir", dir, "--since", "-1", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_ARG");
  });

  it("dry-run writes nothing — registry byte-identical, no new files", () => {
    writeRegistry([{ name: "Button/Primary", category: "button", markup: "<button></button>", tokensUsed: [], scope: "local" }]);
    const regPath = join(dir, "design", "component-registry.json");
    const before = readFileSync(regPath, "utf8");
    const mtimeBefore = statSync(regPath).mtimeMs;
    writeLog([frame({ nodeId: "a", op: "deleted", nodeName: "Button/Primary" })]);
    const { code } = capture(["figma", "reconcile", "--dir", dir, "--dry-run", "--json"]);
    expect(code).toBe(0);
    expect(readFileSync(regPath, "utf8")).toBe(before); // unchanged
    expect(statSync(regPath).mtimeMs).toBe(mtimeBefore);
    expect(existsSync(join(dir, "design", "figma.changes.jsonl.bak"))).toBe(false);
  });
});
