import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  validateEvent,
  parseLedger,
  buildEvent,
  serializeEvent,
  nextEventId,
  MemoryEventError,
  isEventType,
  isMedium,
} from "../src/core/memory-events.js";

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof MemoryEventError ? e.code : "OTHER";
  }
}

describe("memory-events — validateEvent", () => {
  it("accepts each type with its required data", () => {
    const happy: Record<string, Record<string, unknown>> = {
      variant_generated: { persona: "liquid-glass", mode: "desktop" },
      rendition_created: {},
      taste_verdict: { scores: {}, lowestAxis: "Motion", round: 1, pass: true },
      user_pick: { chosen: "d1", rejected: [] },
      vibe_edit: { word: "warmer", axis: "Depth/Surface" },
      manual_edit: { summary: "tweaked the hero" },
      token_change: { path: "color.primary", from: "#111", to: "#222" },
      component_registered: { name: "Card/Elevated" },
      harvested: { source: "https://example.com" },
      duel_result: { benchmark: "linear", traits: [] },
      gap: { text: "motion axis has no bounce guidance", target: "taste-rubric.md#motion" },
      lint_run: { check: "a11y-lint", file: "index.html", errorCount: 0, warningCount: 0, checkIds: [] },
      autofix_applied: { file: "index.html", fixCount: 1, ruleIds: ["viewport-meta"] },
      reconcile_applied: { added: [], updated: [], deprecated: [] },
      taste_vote: { a: "item-1", b: "item-2", winner: "a" },
    };
    for (const [type, data] of Object.entries(happy)) {
      expect(codeOf(() => validateEvent(type, data, undefined)), type).toBeNull();
    }
    expect(codeOf(() => validateEvent("insight", { text: "learned x" }, ["e1"]))).toBeNull();
  });

  it("records a gap event with text+target", () => {
    expect(codeOf(() => validateEvent("gap", { text: "no bounce guidance", target: "taste-rubric.md#motion" }, undefined))).toBeNull();
  });

  it("rejects gap missing target with BAD_EVENT", () => {
    expect(codeOf(() => validateEvent("gap", { text: "no bounce guidance" }, undefined))).toBe("BAD_EVENT");
  });

  it("gap does not require refs", () => {
    expect(codeOf(() => validateEvent("gap", { text: "x", target: "personas" }, undefined))).toBeNull();
    expect(codeOf(() => validateEvent("gap", { text: "x", target: "personas" }, []))).toBeNull();
  });

  it("rejects an unknown type with BAD_EVENT_TYPE", () => {
    expect(codeOf(() => validateEvent("bogus", {}, undefined))).toBe("BAD_EVENT_TYPE");
  });

  it("rejects a missing required data key with BAD_EVENT", () => {
    expect(codeOf(() => validateEvent("user_pick", { chosen: "d1" }, undefined))).toBe("BAD_EVENT");
    expect(codeOf(() => validateEvent("vibe_edit", { word: "warmer" }, undefined))).toBe("BAD_EVENT");
  });

  it("insight requires non-empty refs", () => {
    expect(codeOf(() => validateEvent("insight", { text: "x" }, undefined))).toBe("BAD_EVENT");
    expect(codeOf(() => validateEvent("insight", { text: "x" }, []))).toBe("BAD_EVENT");
    expect(codeOf(() => validateEvent("insight", { text: "x" }, ["e1"]))).toBeNull();
  });

  it("EVENT_TYPES has 16 members; isEventType/isMedium guard", () => {
    expect(EVENT_TYPES.length).toBe(16);
    expect(isEventType("gap")).toBe(true);
    expect(isEventType("user_pick")).toBe(true);
    expect(isEventType("lint_run")).toBe(true);
    expect(isEventType("autofix_applied")).toBe(true);
    expect(isEventType("reconcile_applied")).toBe(true);
    expect(isEventType("taste_vote")).toBe(true);
    expect(isEventType("nope")).toBe(false);
    expect(isMedium("html")).toBe(true);
    expect(isMedium("figma")).toBe(true);
    expect(isMedium("pdf")).toBe(false);
  });
});

describe("memory-events — build / serialize / nextEventId", () => {
  it("nextEventId is monotonic", () => {
    expect(nextEventId(0)).toBe("e1");
    expect(nextEventId(4)).toBe("e5");
  });

  it("buildEvent omits undefined optionals and serialises stably with a fixed key order", () => {
    const e = buildEvent({ id: "e1", t: "2026-07-08T09:00:00Z", type: "user_pick", data: { chosen: "d1", rejected: [] } });
    expect(e.actor).toBeUndefined();
    expect(e.artifact).toBeUndefined();
    const line = serializeEvent(e);
    expect(line).toBe(serializeEvent(e));
    expect(line.startsWith('{"v":1,"id":"e1","t":"2026-07-08T09:00:00Z","type":"user_pick"')).toBe(true);
  });

  it("buildEvent keeps set optionals and drops an empty artifact", () => {
    const e = buildEvent({
      id: "e2",
      t: "2026-07-08T10:00:00Z",
      type: "variant_generated",
      data: { persona: "x", mode: "desktop" },
      actor: "jang",
      medium: "html",
      designId: "d1",
      artifact: { fingerprint: "sha256:ab" },
      refs: ["e1"],
    });
    expect(e.actor).toBe("jang");
    expect(e.artifact).toEqual({ fingerprint: "sha256:ab" });
    expect(e.refs).toEqual(["e1"]);
    const e3 = buildEvent({ id: "e3", t: "2026-07-08T11:00:00Z", type: "rendition_created", data: {}, artifact: {} });
    expect(e3.artifact).toBeUndefined();
  });
});

describe("memory-events — parseLedger", () => {
  it("parses multiple lines, skips blanks, preserves ids", () => {
    const text =
      [
        serializeEvent(buildEvent({ id: "e1", t: "2026-07-08T09:00:00Z", type: "variant_generated", data: { persona: "x", mode: "d" } })),
        "",
        serializeEvent(buildEvent({ id: "e2", t: "2026-07-08T10:00:00Z", type: "user_pick", data: { chosen: "d1", rejected: [] } })),
      ].join("\n") + "\n";
    const events = parseLedger(text);
    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(events[1]?.type).toBe("user_pick");
  });

  it("throws BAD_LEDGER naming the offending 1-based line number", () => {
    const text = '{"v":1,"id":"e1","t":"t","type":"user_pick","data":{}}\nNOT JSON\n';
    try {
      parseLedger(text);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MemoryEventError);
      expect((e as MemoryEventError).code).toBe("BAD_LEDGER");
      expect((e as MemoryEventError).message).toContain("line 2");
    }
  });

  it("rejects a line whose type is not in the v1 set as BAD_LEDGER", () => {
    expect(codeOf(() => parseLedger('{"id":"e1","t":"t","type":"nope","data":{}}\n'))).toBe("BAD_LEDGER");
  });
});
