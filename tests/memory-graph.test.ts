import { describe, expect, it } from "vitest";
import { compileGraph } from "../src/core/memory-graph.js";
import { buildEvent } from "../src/core/memory-events.js";
import type { EventType, MemoryEvent } from "../src/core/memory-events.js";

const NOW = "2026-07-08T00:00:00Z";

function ev(
  id: string,
  type: EventType,
  data: Record<string, unknown>,
  t: string,
  extra: Partial<{ designId: string; refs: string[] }> = {},
): MemoryEvent {
  return buildEvent({ id, t, type, data, designId: extra.designId, refs: extra.refs });
}

function daysBefore(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();
}

describe("memory-graph — half-life decay", () => {
  it("a 30-day-old contributing event weighs 0.5", () => {
    const t = daysBefore(NOW, 30);
    const g = compileGraph(
      [
        ev("e1", "variant_generated", { persona: "p", mode: "d" }, t, { designId: "d1" }),
        ev("e2", "user_pick", { chosen: "d1", rejected: [] }, t),
      ],
      NOW,
    );
    expect(g.personas["p"]?.rawPicks).toBe(1);
    expect(g.personas["p"]?.pickWeight).toBeCloseTo(0.5, 3);
    expect(g.halfLifeDays).toBe(30);
  });
});

describe("memory-graph — aggregation", () => {
  const events: MemoryEvent[] = [
    ev("e1", "variant_generated", { persona: "liquid-glass", mode: "desktop" }, NOW, { designId: "d1" }),
    ev("e2", "user_pick", { chosen: "d1", rejected: ["d2"] }, NOW),
    ev("e3", "vibe_edit", { word: "warmer", axis: "Depth/Surface" }, NOW),
    ev("e4", "taste_verdict", { scores: {}, lowestAxis: "Motion", round: 1, pass: false }, NOW),
    ev("e5", "token_change", { path: "color.primary", from: "#1", to: "#2", reason: "calmer brand" }, NOW),
    ev("e6", "insight", { text: "prefers calm" }, NOW, { refs: ["e2", "e5"] }),
  ];
  const g = compileGraph(events, NOW);

  it("attributes a pick to the design's persona", () => {
    expect(g.personas["liquid-glass"]?.generated).toBe(1);
    expect(g.personas["liquid-glass"]?.rawPicks).toBe(1);
  });

  it("records a vibe and adds its word to the axis fixes", () => {
    expect(g.vibes.find((v) => v.word === "warmer")?.axis).toBe("Depth/Surface");
    expect(g.axes["Depth/Surface"]?.fixes).toContain("warmer");
  });

  it("accrues a failed verdict onto the lowest axis", () => {
    expect(g.axes["Motion"]?.failWeight).toBeGreaterThan(0);
  });

  it("counts token changes and keeps the last reason", () => {
    expect(g.tokens["color.primary"]?.changes).toBe(1);
    expect(g.tokens["color.primary"]?.lastReason).toBe("calmer brand");
  });

  it("lifts insights (with provenance) into the graph", () => {
    expect(g.insights[0]?.text).toBe("prefers calm");
    expect(g.insights[0]?.refs).toEqual(["e2", "e5"]);
  });

  it("compiles deterministically (byte-identical) for the same events + now", () => {
    expect(JSON.stringify(compileGraph(events, NOW))).toBe(JSON.stringify(compileGraph(events, NOW)));
  });

  it("orders vibes by weight descending", () => {
    const many: MemoryEvent[] = [
      ev("e1", "vibe_edit", { word: "a", axis: "X" }, daysBefore(NOW, 60)),
      ev("e2", "vibe_edit", { word: "b", axis: "X" }, NOW),
      ev("e3", "vibe_edit", { word: "b", axis: "X" }, NOW),
    ];
    const gg = compileGraph(many, NOW);
    expect(gg.vibes[0]?.word).toBe("b"); // heavier (2 recent) sorts first
  });
});

describe("memory-graph — insight recurrence (ExpeL)", () => {
  it("counts an insight stated twice as one cluster: seen 2, upvotes 1 on both entries", () => {
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
      ev("e2", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    expect(g.insights).toHaveLength(2);
    for (const entry of g.insights) {
      expect(entry.seen).toBe(2);
      expect(entry.upvotes).toBe(1);
      expect(entry.downvotes).toBe(0);
    }
  });

  it("treats a differently-worded restatement as a separate insight (no fuzzy matching)", () => {
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm palettes" }, NOW, { refs: ["e0"] }),
      ev("e2", "insight", { text: "likes muted colors" }, NOW, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    for (const entry of g.insights) {
      expect(entry.seen).toBe(1);
      expect(entry.upvotes).toBe(0);
    }
  });

  it("clusters across whitespace, case and a trailing period", () => {
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "A lesson." }, NOW, { refs: ["e0"] }),
      ev("e2", "insight", { text: "a  lesson" }, NOW, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    for (const entry of g.insights) expect(entry.seen).toBe(2);
  });

  it("counts data.vote=down as a downvote and not an upvote", () => {
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
      ev("e2", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
      ev("e3", "insight", { text: "prefers calm", vote: "down" }, NOW, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    for (const entry of g.insights) {
      expect(entry.seen).toBe(3);
      expect(entry.upvotes).toBe(1);
      expect(entry.downvotes).toBe(1);
    }
  });

  it("sets lastSeenAt to the newest t in the cluster, not the entry's own t", () => {
    const older = daysBefore(NOW, 10);
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm" }, older, { refs: ["e0"] }),
      ev("e2", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    const olderEntry = g.insights.find((i) => i.id === "e1");
    expect(olderEntry?.lastSeenAt).toBe(NOW);
  });

  it("keeps lastSeenAt correct across mixed UTC offsets", () => {
    const zulu = "2026-07-17T10:00:00Z";
    const offset = "2026-07-17T12:00:00+07:00"; // = 05:00Z, earlier than zulu
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm" }, offset, { refs: ["e0"] }),
      ev("e2", "insight", { text: "prefers calm" }, zulu, { refs: ["e0"] }),
    ];
    const g = compileGraph(events, NOW);
    for (const entry of g.insights) expect(entry.lastSeenAt).toBe(zulu);
  });

  it("a single insight reports seen 1, upvotes 0, downvotes 0", () => {
    const events: MemoryEvent[] = [ev("e1", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] })];
    const g = compileGraph(events, NOW);
    expect(g.insights[0]).toMatchObject({ seen: 1, upvotes: 0, downvotes: 0 });
  });

  it("compiling the same ledger twice with the same --now is byte-identical", () => {
    const events: MemoryEvent[] = [
      ev("e1", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
      ev("e2", "insight", { text: "prefers calm" }, NOW, { refs: ["e0"] }),
      ev("e3", "insight", { text: "likes muted colors", vote: "down" }, NOW, { refs: ["e0"] }),
    ];
    expect(JSON.stringify(compileGraph(events, NOW))).toBe(JSON.stringify(compileGraph(events, NOW)));
  });
});
