/**
 * Pure kernel tests for src/core/agents-gen.ts — genealogy naming matrix,
 * name sanitization, fnv1a template hashing, placeholder rendering, and the
 * stamp parse roundtrip. Also pins the three real templates/agents/ files to
 * the emitter contract (all placeholders present, stamp role = filename).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ROSTER,
  agentName,
  parseAgentStamp,
  renderAgent,
  sanitizeAgentName,
  templateHash,
} from "../src/core/agents-gen.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NAME_RE = /^[a-z][a-z0-9-]*$/;

// ─── agentName — role-first with the genealogy suffix ────────────────────────

describe("agentName", () => {
  it("with a studio: generic role prefix + studio-project genealogy suffix", () => {
    expect(agentName("designer", "vsf-pcp", "JANG")).toBe("designer-jang-vsf-pcp");
    expect(agentName("curator", "vsf-pcp", "JANG")).toBe("curator-jang-vsf-pcp");
    expect(agentName("figma-hand", "vsf-pcp", "JANG")).toBe("figma-jang-vsf-pcp");
  });

  it("without a studio: role prefix + project only", () => {
    expect(agentName("designer", "vsf-pcp", null)).toBe("designer-vsf-pcp");
    expect(agentName("curator", "vsf-pcp", null)).toBe("curator-vsf-pcp");
    expect(agentName("figma-hand", "vsf-pcp", null)).toBe("figma-vsf-pcp");
  });

  it("sanitizes a dirty studio name into the Claude subagent shape", () => {
    for (const role of ROSTER) {
      const name = agentName(role, "vsf-pcp", "Jang Trịnh!");
      expect(name).toMatch(NAME_RE);
    }
    expect(agentName("designer", "vsf-pcp", "Jang Trịnh!")).toBe("designer-jang-tr-nh-vsf-pcp");
  });

  it("caps the assembled name at 64 chars, still valid", () => {
    const name = agentName("curator", "p".repeat(40), "s".repeat(40));
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(NAME_RE);
  });
});

describe("sanitizeAgentName", () => {
  it("lowercases, replaces junk, collapses runs, trims edges", () => {
    expect(sanitizeAgentName("Jang Trịnh!")).toBe("jang-tr-nh");
    expect(sanitizeAgentName("--A__B--")).toBe("a-b");
  });

  it("drops leading non-letters so the name starts with [a-z]", () => {
    expect(sanitizeAgentName("42nd-street")).toBe("nd-street");
  });

  it("returns '' when nothing survives (caller falls back)", () => {
    expect(sanitizeAgentName("日本語")).toBe("");
  });

  it("re-trims a hyphen exposed by the 64-char cap", () => {
    const raw = "a".repeat(63) + "-" + "b".repeat(10);
    const s = sanitizeAgentName(raw);
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith("-")).toBe(false);
  });
});

// ─── templateHash ─────────────────────────────────────────────────────────────

describe("templateHash", () => {
  it("returns 8 lowercase hex chars, deterministically", () => {
    const h = templateHash("hello template");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(templateHash("hello template")).toBe(h);
  });

  it("differs across different inputs (1-byte sensitivity)", () => {
    expect(templateHash("abc")).not.toBe(templateHash("abd"));
    expect(templateHash("")).not.toBe(templateHash(" "));
  });
});

// ─── renderAgent ──────────────────────────────────────────────────────────────

const TPL = `---
name: {{NAME}}
---

You are {{NAME}}, an agent for **{{PROJECT}}**.{{STUDIO_LINE}}

<!-- design-os agents · roster-role: designer · template-hash: {{HASH}} -->
`;

describe("renderAgent", () => {
  it("substitutes every placeholder — no '{{' survives", () => {
    const out = renderAgent(TPL, { name: "jang-vsf-pcp", project: "vsf-pcp", studio: "JANG" });
    expect(out).not.toContain("{{");
    expect(out).toContain("name: jang-vsf-pcp");
    expect(out).toContain("You are jang-vsf-pcp, an agent for **vsf-pcp**.");
    expect(out).toContain(" You carry the JANG studio's soul as your base identity.");
    expect(out).toContain(`template-hash: ${templateHash(TPL)}`);
  });

  it("emits an empty STUDIO_LINE when there is no studio", () => {
    const out = renderAgent(TPL, { name: "vsf-pcp-designer", project: "vsf-pcp", studio: null });
    expect(out).not.toContain("{{");
    expect(out).not.toContain("studio's soul");
    expect(out).toContain("an agent for **vsf-pcp**.\n");
  });
});

// ─── parseAgentStamp ──────────────────────────────────────────────────────────

describe("parseAgentStamp", () => {
  it("roundtrips: rendered file → {role, hash of the source template}", () => {
    const out = renderAgent(TPL, { name: "x", project: "p", studio: null });
    expect(parseAgentStamp(out)).toEqual({ role: "designer", hash: templateHash(TPL) });
  });

  it("returns null on a stamp-free file and on the raw template ({{HASH}} is not hex)", () => {
    expect(parseAgentStamp("# just a file\n")).toBeNull();
    expect(parseAgentStamp(TPL)).toBeNull();
  });
});

// ─── Real templates honour the emitter contract ───────────────────────────────

describe("templates/agents/ contract", () => {
  it.each([...ROSTER])("%s.md carries all placeholders and a stamp naming its own role", (role) => {
    const tpl = readFileSync(join(REPO_ROOT, "templates", "agents", `${role}.md`), "utf8");
    for (const ph of ["{{NAME}}", "{{PROJECT}}", "{{STUDIO_LINE}}", "{{HASH}}"]) {
      expect(tpl, `${role}.md must contain ${ph}`).toContain(ph);
    }
    expect(tpl).toContain(`roster-role: ${role} `);
    // Rendering the real template yields a parseable stamp for the same role.
    const rendered = renderAgent(tpl, { name: "n", project: "p", studio: "S" });
    expect(rendered).not.toContain("{{");
    expect(parseAgentStamp(rendered)).toEqual({ role, hash: templateHash(tpl) });
  });

  // spec 002 WS-B: every project role feeds knowledge/ via a gap event and never
  // edits it directly — the guard line must be present in all three templates.
  it.each([...ROSTER])("%s.md carries the knowledge-guard line (record gap, no knowledge/ edits)", (role) => {
    const tpl = readFileSync(join(REPO_ROOT, "templates", "agents", `${role}.md`), "utf8");
    expect(tpl, `${role}.md must route knowledge changes through a gap event`).toContain(
      "ui memory record gap",
    );
    expect(tpl, `${role}.md must forbid editing knowledge/`).toMatch(/NEVER edit `knowledge\/`/);
  });
});
