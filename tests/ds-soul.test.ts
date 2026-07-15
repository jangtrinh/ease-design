/**
 * `ds-soul.ts` — the pure declared-stance kernel: SOUL_SCAFFOLD, checkSoul
 * (6 structure findings — one positive + one negative fixture each),
 * writeSoulScaffold (write / EXISTS / force semantics) and the 150-line
 * context cap.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  SOUL_SCAFFOLD,
  SOUL_FILENAME,
  checkSoul,
  writeSoulScaffold,
  soulSectionForContext,
} from "../src/core/ds-soul.js";
import {
  STUDIO_SOUL_SCAFFOLD,
  soulName,
  checkStudioSoul,
} from "../src/core/ds-soul-studio.js";

/** A fully-edited, ratified soul — the 0-findings fixture. (Named "vela", NOT
 * "acme": Acme is in content-checks' placeholder-name set, so an "acme" soul
 * title correctly trips soul-placeholder-copy — proof the reuse works.) */
const RATIFIED = `---
status: ratified
---

# Design Soul — vela

## Never

- rounded corners over 4px
- purple gradients

## Always

- display type at 44px or larger

## Voice

- direct, no filler
`;

/** A fully-edited, ratified, NAMED studio soul — the 0-findings fixture for checkStudioSoul. */
const STUDIO_RATIFIED = `---
status: ratified
name: JANG
---

# Design Soul — studio

## Never

- generic stock photography

## Always

- ship display type at 44px or larger

## Voice

- direct, no filler
`;

const ids = (text: string): string[] => checkSoul(text).findings.map((f) => f.checkId);

// ─── The scaffold itself ──────────────────────────────────────────────────────

describe("checkSoul on the untouched scaffold", () => {
  it("reports exactly {empty-section ×3 errors, draft + untouched warnings}", () => {
    const r = checkSoul(SOUL_SCAFFOLD);
    expect(r.errorCount).toBe(3);
    expect(r.warningCount).toBe(2);
    expect(r.findings.filter((f) => f.checkId === "soul-empty-section")).toHaveLength(3);
    expect(ids(SOUL_SCAFFOLD)).toContain("soul-draft-status");
    expect(ids(SOUL_SCAFFOLD)).toContain("soul-scaffold-untouched");
  });

  it("a ratified, fully-edited soul yields zero findings", () => {
    const r = checkSoul(RATIFIED);
    expect(r.findings).toEqual([]);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
  });
});

// ─── soul-missing-section (error) ─────────────────────────────────────────────

describe("soul-missing-section (error)", () => {
  it("fires once per absent required heading", () => {
    const noVoice = RATIFIED.replace(/## Voice[\s\S]*$/, "");
    const r = checkSoul(noVoice);
    expect(r.errorCount).toBe(1);
    expect(r.findings[0]?.checkId).toBe("soul-missing-section");
    expect(r.findings[0]?.message).toContain("## Voice");
  });
  it("does not fire when all three headings exist", () => {
    expect(ids(RATIFIED)).not.toContain("soul-missing-section");
  });
});

// ─── soul-empty-section (error) ───────────────────────────────────────────────

describe("soul-empty-section (error)", () => {
  it("fires when a section has only a placeholder-comment bullet", () => {
    const emptied = RATIFIED.replace(
      "- direct, no filler",
      "- <!-- copy nói giọng gì -->",
    );
    const r = checkSoul(emptied);
    const empty = r.findings.filter((f) => f.checkId === "soul-empty-section");
    expect(empty).toHaveLength(1);
    expect(empty[0]?.severity).toBe("error");
    expect(empty[0]?.message).toContain("## Voice");
    expect(empty[0]?.line).toBeGreaterThan(0);
  });
  it("does not fire when every section has a real bullet", () => {
    expect(ids(RATIFIED)).not.toContain("soul-empty-section");
  });
});

// ─── soul-draft-status (warning) ──────────────────────────────────────────────

describe("soul-draft-status (warning)", () => {
  it("fires on status: draft", () => {
    const draft = RATIFIED.replace("status: ratified", "status: draft");
    const f = checkSoul(draft).findings.find((x) => x.checkId === "soul-draft-status");
    expect(f?.severity).toBe("warning");
  });
  it("fires when the frontmatter (or its status key) is missing entirely", () => {
    const noFm = RATIFIED.replace(/^---\nstatus: ratified\n---\n/, "");
    expect(ids(noFm)).toContain("soul-draft-status");
  });
  it("does not fire on status: ratified", () => {
    expect(ids(RATIFIED)).not.toContain("soul-draft-status");
  });
});

// ─── soul-scaffold-untouched (warning) ────────────────────────────────────────

describe("soul-scaffold-untouched (warning)", () => {
  it("fires while any scaffold placeholder comment survives", () => {
    expect(ids(SOUL_SCAFFOLD)).toContain("soul-scaffold-untouched");
  });
  it("does not fire once the placeholders are replaced", () => {
    expect(ids(RATIFIED)).not.toContain("soul-scaffold-untouched");
  });
});

// ─── soul-too-long (warning) ──────────────────────────────────────────────────

describe("soul-too-long (warning)", () => {
  it("fires past 120 lines (short beats long)", () => {
    const padding = Array.from({ length: 115 }, (_, i) => `- extra voice clause ${i}`).join("\n");
    const long = RATIFIED + padding + "\n";
    const r = checkSoul(long);
    expect(r.errorCount).toBe(0);
    const f = r.findings.find((x) => x.checkId === "soul-too-long");
    expect(f?.severity).toBe("warning");
  });
  it("does not fire on a short soul", () => {
    expect(ids(RATIFIED)).not.toContain("soul-too-long");
  });
});

// ─── soul-placeholder-copy (error) ────────────────────────────────────────────

describe("soul-placeholder-copy (error)", () => {
  it("fires on Jane-Doe filler, preserving the line number", () => {
    const text = `---
status: ratified
---

## Never

- no gradients

## Always

- real photos

## Voice

- Jane Doe writes all copy
`;
    const r = checkSoul(text);
    expect(r.errorCount).toBe(1);
    expect(r.findings[0]?.checkId).toBe("soul-placeholder-copy");
    expect(r.findings[0]?.line).toBe(15);
  });
  it("fires on lorem ipsum too", () => {
    const text = RATIFIED.replace("- direct, no filler", "- lorem ipsum tone");
    expect(ids(text)).toContain("soul-placeholder-copy");
  });
  it("does not fire on real stance copy", () => {
    expect(ids(RATIFIED)).not.toContain("soul-placeholder-copy");
  });
});

// ─── writeSoulScaffold ────────────────────────────────────────────────────────

describe("writeSoulScaffold", () => {
  it("writes the scaffold into a fresh design dir", () => {
    const designDir = join(mkdtempSync(join(tmpdir(), "ease-soul-")), "design");
    const r = writeSoulScaffold(designDir);
    expect(r.written).toBe(true);
    expect(r.path).toBe(join(designDir, SOUL_FILENAME));
    expect(readFileSync(r.path, "utf8")).toBe(SOUL_SCAFFOLD);
  });

  it("never overwrites an existing soul.md without force", () => {
    const designDir = join(mkdtempSync(join(tmpdir(), "ease-soul-")), "design");
    writeSoulScaffold(designDir);
    const path = join(designDir, SOUL_FILENAME);
    writeFileSync(path, RATIFIED, "utf8");
    const r = writeSoulScaffold(designDir);
    expect(r.written).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(RATIFIED);
  });

  it("force=true overwrites back to the scaffold", () => {
    const designDir = join(mkdtempSync(join(tmpdir(), "ease-soul-")), "design");
    const path = writeSoulScaffold(designDir).path;
    writeFileSync(path, RATIFIED, "utf8");
    const r = writeSoulScaffold(designDir, true);
    expect(r.written).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(SOUL_SCAFFOLD);
  });
});

// ─── soulSectionForContext ────────────────────────────────────────────────────

describe("soulSectionForContext", () => {
  it("passes a short soul through trimmed and uncut", () => {
    expect(soulSectionForContext("\n" + RATIFIED + "\n")).toBe(RATIFIED.trim());
  });

  it("caps at 150 lines and appends a truncation note", () => {
    const long = Array.from({ length: 200 }, (_, i) => `- clause ${i}`).join("\n");
    const out = soulSectionForContext(long);
    const body = out.split("\n\n…(")[0] ?? "";
    expect(body.split("\n")).toHaveLength(150);
    expect(out).toContain("truncated to 150 lines");
  });
});

// ─── STUDIO_SOUL_SCAFFOLD — the genealogy layer above every project soul ──────

describe("STUDIO_SOUL_SCAFFOLD", () => {
  it("matches the phase-01 spec verbatim", () => {
    expect(STUDIO_SOUL_SCAFFOLD).toBe(`---
status: draft
name: <studio>
---

# Design Soul — studio

_The layer ABOVE every project soul: what stays true across ALL your products.
A project's design/soul.md inherits this and overrides on conflict.
\`name:\` above names your agents (e.g. name: JANG → agent jang-<project>).
Below both sits the factory baseline design:os ships ('ui ds soul factory')._

## Never

- <!-- điều studio KHÔNG BAO GIỜ làm, bất kể project -->

## Always

- <!-- điều mọi sản phẩm của studio LUÔN giữ -->

## Voice

- <!-- giọng chung của studio -->
`);
  });
});

// ─── soulName ──────────────────────────────────────────────────────────────────

describe("soulName", () => {
  it("parses a real name from frontmatter, trimmed", () => {
    expect(soulName("---\nstatus: draft\nname:   JANG   \n---\n")).toBe("JANG");
  });

  it("returns null when the name key is absent", () => {
    expect(soulName("---\nstatus: draft\n---\n")).toBeNull();
  });

  it("returns null on an empty name value", () => {
    expect(soulName("---\nstatus: draft\nname:\n---\n")).toBeNull();
  });

  it("returns null on the untouched <studio> placeholder", () => {
    expect(soulName(STUDIO_SOUL_SCAFFOLD)).toBeNull();
  });

  it("returns null when there is no frontmatter block at all", () => {
    expect(soulName("# Design Soul — studio\n\n## Never\n\n- no gradients\n")).toBeNull();
  });

  it("finds a real name on the ratified fixture", () => {
    expect(soulName(STUDIO_RATIFIED)).toBe("JANG");
  });
});

// ─── checkStudioSoul ─────────────────────────────────────────────────────────────

describe("checkStudioSoul", () => {
  it("the untouched STUDIO_SOUL_SCAFFOLD reports soul-missing-name plus the P1 structure findings", () => {
    const r = checkStudioSoul(STUDIO_SOUL_SCAFFOLD);
    const found = r.findings.map((f) => f.checkId);
    expect(found).toContain("soul-missing-name");
    expect(found.filter((id) => id === "soul-empty-section")).toHaveLength(3);
    expect(found).toContain("soul-draft-status");
    expect(found).toContain("soul-scaffold-untouched");
    // errors: 3x soul-empty-section + soul-missing-name; warnings: draft + untouched
    // (soul-scaffold-untouched matches the STUDIO scaffold's own placeholder comments).
    expect(r.errorCount).toBe(4);
    expect(r.warningCount).toBe(2);
  });

  it("a ratified, named studio soul yields zero findings", () => {
    const r = checkStudioSoul(STUDIO_RATIFIED);
    expect(r.findings).toEqual([]);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
  });

  it("does not fire soul-missing-name once a real name is set", () => {
    const named = STUDIO_SOUL_SCAFFOLD.replace("name: <studio>", "name: JANG");
    const found = checkStudioSoul(named).findings.map((f) => f.checkId);
    expect(found).not.toContain("soul-missing-name");
  });

  it("fires soul-missing-name alone on an otherwise-ratified-but-unnamed soul", () => {
    const unnamed = STUDIO_RATIFIED.replace("name: JANG\n", "");
    const r = checkStudioSoul(unnamed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.checkId).toBe("soul-missing-name");
    expect(r.findings[0]?.severity).toBe("error");
  });

  it("does not fire soul-scaffold-untouched on a clean ratified studio soul", () => {
    const found = checkStudioSoul(STUDIO_RATIFIED).findings.map((f) => f.checkId);
    expect(found).not.toContain("soul-scaffold-untouched");
  });
});
