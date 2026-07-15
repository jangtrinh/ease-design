/**
 * `ds-soul-factory.ts` — the shipped design:os baseline stance (FACTORY_SOUL) +
 * its context-section formatter. Pure, fs-free, compiled-in constant.
 */
import { describe, expect, it } from "vitest";

import { FACTORY_SOUL, factorySoulSectionForContext } from "../src/core/ds-soul-factory.js";
import { checkSoul } from "../src/core/ds-soul.js";

describe("FACTORY_SOUL", () => {
  // Linter pairing: the shipped baseline must pass its own structure check — 0 error, 0 warning, forever.
  it("passes its own structure linter (checkSoul) with zero findings", () => {
    const r = checkSoul(FACTORY_SOUL);
    expect(r.findings).toEqual([]);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
  });

  it("is 55 lines and stays within the 120-line cap", () => {
    expect(FACTORY_SOUL.split("\n")).toHaveLength(55);
    expect(FACTORY_SOUL.split("\n").length).toBeLessThanOrEqual(120);
  });

  it("frontmatter declares status: ratified and layer: factory", () => {
    expect(FACTORY_SOUL).toContain("status: ratified");
    expect(FACTORY_SOUL).toContain("layer: factory");
  });

  it("each of ## Never, ## Always, ## Voice has at least 4 real bullets", () => {
    for (const name of ["Never", "Always", "Voice"]) {
      const headingRe = new RegExp(`^##[ \\t]+${name}[ \\t]*$`, "m");
      const m = headingRe.exec(FACTORY_SOUL);
      expect(m, `missing heading ## ${name}`).not.toBeNull();
      const rest = FACTORY_SOUL.slice((m?.index ?? 0) + (m?.[0].length ?? 0));
      const next = /^##[ \t]+\S/m.exec(rest);
      const body = next !== null ? rest.slice(0, next.index) : rest;
      const bullets = body.match(/^- /gm) ?? [];
      expect(bullets.length, `## ${name} has too few bullets`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("factorySoulSectionForContext", () => {
  it("returns FACTORY_SOUL trimmed, unmodified otherwise", () => {
    expect(factorySoulSectionForContext()).toBe(FACTORY_SOUL.trim());
  });
});
