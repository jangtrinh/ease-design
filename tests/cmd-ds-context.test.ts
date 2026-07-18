import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";

const PERSONA_DATA = new URL(
  "../knowledge/personas/personas.json",
  import.meta.url,
).pathname;

// ── FILE-LEVEL EASE_DESIGN_HOME guard (invariant #5) ─────────────────────────
// `ds context --include soul` reads $EASE_DESIGN_HOME/studio-soul.md, so a
// developer machine with a real studio soul would otherwise leak a studio
// section into every unguarded assertion in this file (e.g. the soul-absence
// `not.toContain("## Soul")`). Pin the home to a fresh EMPTY tmp dir per test,
// for every current AND future describe. The studio-layer describe below
// overrides it locally (its inner beforeEach runs after this one and wins).
const savedHomeFile = process.env["EASE_DESIGN_HOME"];
beforeEach(() => {
  process.env["EASE_DESIGN_HOME"] = mkdtempSync(join(tmpdir(), "ease-ctx-home-guard-"));
});
afterEach(() => {
  if (savedHomeFile === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHomeFile;
});

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

function initDs(tmp: string, bare = false) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "landing for a gym",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
    ...(bare ? ["--bare"] : []),
  ]);
}

// ─── ds context ──────────────────────────────────────────────────────────────

describe("ui ds context", () => {
  it("round-trip: output starts with # Design System: and contains persona slug", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^# Design System: acme/);
    expect(r.stdout).toContain("liquid-glass");
  });

  it("--format json returns structured object with semantic tokens", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp, true); // --bare: keep the registry empty so this test stays focused on tokens
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const ctx = JSON.parse(r.stdout).data;
    expect(ctx.semantic.length).toBeGreaterThan(10);
    expect(ctx.registry).toHaveLength(0);
  });

  it("--include tokens emits only the tokens section", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "tokens"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("## Tokens");
    expect(r.stdout).not.toContain("## Registered components");
    expect(r.stdout).not.toContain("## Naming rules");
  });

  it("small --max-bytes truncates the token tables but renders the soul chain whole", () => {
    // NEW contract: --max-bytes bounds ONLY the variable data sections
    // (token/registry/naming/anti-pattern tables). The soul chain (project +
    // studio + factory baseline) is FIXED declared-stance prose, exempt from the
    // budget — always rendered whole, never byte-sliced (like --with-theme).
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "512"]);
    expect(r.exitCode).toBe(0);
    // Factory section renders WHOLE and un-sliced: heading + its exact final line.
    expect(r.stdout).toContain(
      "## Soul — factory (design:os baseline; any project/studio soul above overrides it)",
    );
    expect(r.stdout).toContain("order, in the user's language, without blame.");
    // The variable token table IS truncated under the tiny budget (U+2026 ellipsis).
    expect(r.stdout).toContain("…(truncated)");
  });

  it("--format json --max-bytes 100 exits 0 with valid JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--max-bytes", "100"]);
    expect(r.exitCode).toBe(0);
    // Output must be parseable JSON (not truncated mid-string)
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it("--strict adds enforcement preamble referencing tokens below", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--strict"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ENFORCEMENT");
    expect(r.stdout).toContain("tokens below");
    expect(r.stdout).not.toContain("tokens above");
  });

  it("errors DS_TAMPERED when tokens file is hand-edited", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const tokensPath = join(tmp, "design", "design.tokens.json");
    writeFileSync(tokensPath, '{"color":{"primary":{"$value":"#FF0000","$type":"color"}}}\n');
    const r = capture(["ds", "context", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_TAMPERED");
  });

  it("errors DS_NOT_FOUND when no DS exists in directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-empty-"));
    const r = capture(["ds", "context", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("DS_NOT_FOUND");
  });

  it("errors BAD_ARG for invalid --include value", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "colors", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("errors BAD_ARG for non-numeric --max-bytes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "abc", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("semantic tokens remain in context after change-token converts alias → literal", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);

    // Sanity: color.primary starts as a semantic alias and appears in context
    const before = capture(["ds", "context", "--dir", tmp]);
    expect(before.exitCode).toBe(0);
    expect(before.stdout).toMatch(/\| color\.primary\s+\|/);

    // Mutate to a literal hex via change-token (the only sanctioned mutation)
    const ct = capture([
      "ds", "change-token", "color.primary",
      "--value", "#FF0066",
      "--dir", tmp,
    ]);
    expect(ct.exitCode, `change-token failed: ${ct.stderr}`).toBe(0);

    // Bug regression: post-mutation context MUST still list color.primary.
    // Without the $extensions.ease.layer marker, the alias-shape filter would
    // drop the token and the host model would lose its semantic primary.
    const after = capture(["ds", "context", "--dir", tmp]);
    expect(after.exitCode).toBe(0);
    expect(after.stdout, "color.primary must remain in context after change-token").toMatch(
      /\| color\.primary\s+\|/,
    );
    expect(after.stdout, "the new literal value must be visible to the host model").toContain(
      "#FF0066",
    );
  });
});

// ─── ds context — soul section (P1 soul kernel) ───────────────────────────────

describe("ui ds context — soul section", () => {
  const SOUL_HEADING = "## Soul (declared stance — precedence: brief > soul > memory > floors)";

  it("--include soul emits the section when design/soul.md exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-soul-"));
    initDs(tmp); // ds init writes the soul scaffold alongside the DS
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(SOUL_HEADING);
    expect(r.stdout).toContain("# Design Soul");
  });

  it("the default include carries soul automatically", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-soul-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(SOUL_HEADING);
  });

  it("a project without soul.md falls back to the factory baseline section", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-soul-"));
    initDs(tmp);
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Soul (declared stance");
    expect(r.stdout).toContain(
      "## Soul — factory (design:os baseline; any project/studio soul above overrides it)",
    );
    expect(r.stdout).toContain("no project or studio soul declared yet");
  });

  it("--format json: structured soul is the capped text, or null when absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-soul-"));
    initDs(tmp);
    const withSoul = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(withSoul.exitCode).toBe(0);
    expect(JSON.parse(withSoul.stdout).data.soul).toContain("# Design Soul");

    rmSync(join(tmp, "design", "soul.md"));
    const noSoul = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(noSoul.exitCode).toBe(0);
    expect(JSON.parse(noSoul.stdout).data.soul).toBeNull();
  });
});

// ─── ds context — studio soul layer (genealogy above every project soul) ─────
// EASE_DESIGN_HOME MUST be overridden in tests (plan invariant #5 of memory-store).

const STUDIO_SOUL_TEXT = `---
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

describe("ui ds context — studio soul layer", () => {
  const STUDIO_HEADING = "## Soul — studio (inherited base; the project soul above overrides it on conflict)";
  const savedHome = process.env["EASE_DESIGN_HOME"];
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ease-ctx-studio-home-"));
    process.env["EASE_DESIGN_HOME"] = home;
  });
  afterEach(() => {
    if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
    else process.env["EASE_DESIGN_HOME"] = savedHome;
  });

  function writeStudioSoul(text: string): void {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "studio-soul.md"), text, "utf8");
  }

  it("project-only: no studio file → only the project soul section appears", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("## Soul (declared stance");
    expect(r.stdout).not.toContain(STUDIO_HEADING);
  });

  it("studio-only: project has no soul.md → the studio section still emits, with the 'no project soul yet' note", () => {
    writeStudioSoul(STUDIO_SOUL_TEXT);
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp, true);
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Soul (declared stance");
    expect(r.stdout).toContain(STUDIO_HEADING);
    expect(r.stdout).toContain("no project soul yet");
  });

  it("both: the project section appears BEFORE the studio section", () => {
    writeStudioSoul(STUDIO_SOUL_TEXT);
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    const projectIdx = r.stdout.indexOf("## Soul (declared stance");
    const studioIdx = r.stdout.indexOf(STUDIO_HEADING);
    expect(projectIdx).toBeGreaterThan(-1);
    expect(studioIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(studioIdx);
    expect(r.stdout).not.toContain("no project soul yet");
  });

  it("neither project nor studio soul → the factory baseline is the only stance section", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp, true);
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Soul (declared stance");
    expect(r.stdout).not.toContain(STUDIO_HEADING);
    expect(r.stdout).toContain(
      "## Soul — factory (design:os baseline; any project/studio soul above overrides it)",
    );
    expect(r.stdout).toContain("no project or studio soul declared yet");
  });

  it("--format json: structured carries soul and studioSoul as two separate fields", () => {
    writeStudioSoul(STUDIO_SOUL_TEXT);
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.soul).toContain("# Design Soul");
    expect(data.studioSoul).toContain("# Design Soul — studio");
  });

  it("--format json: studioSoul is null when no studio-soul.md exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.studioSoul).toBeNull();
  });
});

// ─── ds context — factory baseline (design:os shipped stance, always renders) ─

describe("ui ds context — factory baseline", () => {
  const FACTORY_HEADING =
    "## Soul — factory (design:os baseline; any project/studio soul above overrides it)";
  const STUDIO_HEADING = "## Soul — studio (inherited base; the project soul above overrides it on conflict)";

  it("project soul present: the project section appears BEFORE the factory section", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-factory-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    const projectIdx = r.stdout.indexOf("## Soul (declared stance");
    const factoryIdx = r.stdout.indexOf(FACTORY_HEADING);
    expect(projectIdx).toBeGreaterThan(-1);
    expect(factoryIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(factoryIdx);
  });

  describe("with a studio soul", () => {
    const savedHome = process.env["EASE_DESIGN_HOME"];
    let home: string;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), "ease-ctx-factory-home-"));
      process.env["EASE_DESIGN_HOME"] = home;
    });
    afterEach(() => {
      if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
      else process.env["EASE_DESIGN_HOME"] = savedHome;
    });

    function writeStudioSoul(text: string): void {
      mkdirSync(home, { recursive: true });
      writeFileSync(join(home, "studio-soul.md"), text, "utf8");
    }

    it("project + studio + factory: order is project < studio < factory", () => {
      writeStudioSoul(STUDIO_SOUL_TEXT);
      const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-factory-"));
      initDs(tmp);
      const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
      expect(r.exitCode).toBe(0);
      const projectIdx = r.stdout.indexOf("## Soul (declared stance");
      const studioIdx = r.stdout.indexOf(STUDIO_HEADING);
      const factoryIdx = r.stdout.indexOf(FACTORY_HEADING);
      expect(projectIdx).toBeGreaterThan(-1);
      expect(studioIdx).toBeGreaterThan(-1);
      expect(factoryIdx).toBeGreaterThan(-1);
      expect(projectIdx).toBeLessThan(studioIdx);
      expect(studioIdx).toBeLessThan(factoryIdx);
    });
  });

  it("--include tokens (no soul): markdown omits '## Soul' entirely, JSON factorySoul is null", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-factory-"));
    initDs(tmp);
    const md = capture(["ds", "context", "--dir", tmp, "--include", "tokens"]);
    expect(md.exitCode).toBe(0);
    expect(md.stdout).not.toContain("## Soul");

    const jsonR = capture([
      "ds", "context", "--dir", tmp, "--include", "tokens", "--format", "json", "--json",
    ]);
    expect(jsonR.exitCode).toBe(0);
    expect(JSON.parse(jsonR.stdout).data.factorySoul).toBeNull();
  });

  it("--format json with soul included: data.factorySoul is the factory baseline text", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-factory-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(typeof data.factorySoul).toBe("string");
    expect(data.factorySoul).toContain("# Design Soul — factory");
  });
});

// ─── ds context — the soul chain is budget-exempt (the class-level guard) ─────
// --max-bytes bounds ONLY the variable data (token/registry/naming/anti-pattern
// tables). The WHOLE soul chain (project + studio + factory ~2.5KB baseline) is
// fixed declared-stance prose, never byte-sliced — so a big soul chain must never
// starve the token table. `initDs(tmp, true)` (bare) is used where the assertion
// counts tokens, to isolate the token budget from the registry rows that would
// otherwise compete for the same variable budget (unrelated to soul exemption).

describe("ui ds context — soul chain budget exemption", () => {
  const STUDIO_HEADING_TEXT = "# Design Soul — studio";

  // A ~100-line ratified project soul: three sections, ~30 bullets each.
  function bigProjectSoul(): string {
    const bullets = Array.from({ length: 30 }, (_, i) => `- clause ${i}`).join("\n");
    return `---\nstatus: ratified\n---\n\n# Design Soul — big\n\n## Never\n\n${bullets}\n\n## Always\n\n${bullets}\n\n## Voice\n\n${bullets}\n`;
  }

  it("default budget, factory only: tokens stay non-empty despite the ~2.5KB factory baseline", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-exempt-"));
    initDs(tmp, true); // bare: isolate the token budget from registry rows
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.semantic.length).toBeGreaterThan(10);
    expect(typeof data.factorySoul).toBe("string");
    expect(data.factorySoul.length).toBeGreaterThan(0);
    expect(data.soul).toBeNull();
  });

  describe("with a studio soul present", () => {
    const savedHome = process.env["EASE_DESIGN_HOME"];
    let home: string;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), "ease-ctx-exempt-home-"));
      process.env["EASE_DESIGN_HOME"] = home;
    });
    afterEach(() => {
      if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
      else process.env["EASE_DESIGN_HOME"] = savedHome;
    });

    function writeStudioSoul(text: string): void {
      mkdirSync(home, { recursive: true });
      writeFileSync(join(home, "studio-soul.md"), text, "utf8");
    }

    it("default budget, big project soul + studio soul + factory all present: tokens STILL non-empty", () => {
      const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-exempt-"));
      initDs(tmp, true); // bare: isolate the token budget from registry rows
      writeFileSync(join(tmp, "design", "soul.md"), bigProjectSoul(), "utf8");
      writeStudioSoul(STUDIO_SOUL_TEXT);
      const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
      expect(r.exitCode).toBe(0);
      const data = JSON.parse(r.stdout).data;
      expect(data.semantic.length).toBeGreaterThan(10);
      expect(data.soul).toBeTruthy();
      expect(data.studioSoul).toBeTruthy();
      expect(data.factorySoul).toBeTruthy();
      expect(data.studioSoul).toContain(STUDIO_HEADING_TEXT);
    });
  });

  it("tiny --max-bytes 512 still returns valid JSON and keeps the full soul chain", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-exempt-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "512", "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const data = JSON.parse(r.stdout).data;
    // The factory baseline is rendered WHOLE and un-sliced even at the tiny budget.
    expect(typeof data.factorySoul).toBe("string");
    expect(data.factorySoul).toContain("# Design Soul — factory");
    expect(data.factorySoul.trimEnd().endsWith("without blame.")).toBe(true);
    // The variable token table may be reduced to fit — that is the whole point.
    expect(Array.isArray(data.semantic)).toBe(true);
  });
});

// ─── ds context — roles section (spec 011 Phase 2) ───────────────────────────
// Reads the BAKED $extensions["design-os.role"] annotation ('ds import' or a
// 'ds set-role' correction) — never recomputes recognition.

describe("ui ds context — roles section", () => {
  function importDs(tmp: string): void {
    const src = join(tmp, "src-tokens.json");
    writeFileSync(
      src,
      JSON.stringify({ color: { "surface-content": "#FFFFFF", "zorp-glimble": "#123456" } }),
      "utf8",
    );
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
  }

  it("a DS with baked roles (via 'ds import') emits both '## Roles' and '## Missing roles'", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-roles-"));
    importDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("## Roles");
    expect(r.stdout).toContain("background → color.surface-content");
    expect(r.stdout).toContain("## Missing roles");
    // zorp-glimble is unrecognized by name — "primary" never got a token, so it's a gap.
    expect(r.stdout).toMatch(/primary/);
  });

  it("a DS with no baked roles (plain 'ds init') omits both sections — never an error", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-roles-none-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Roles");
    expect(r.stdout).not.toContain("## Missing roles");
  });

  it("a 'ds set-role' correction is what context reads — the owner edit sticks, never recomputed", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-roles-setrole-"));
    importDs(tmp);
    const before = capture(["ds", "context", "--dir", tmp]);
    expect(before.stdout).toContain("background → color.surface-content");
    expect(before.stdout).toMatch(/foreground.*\(no token/);

    const set = capture(["ds", "set-role", "color.surface-content", "foreground", "--dir", tmp, "--json"]);
    expect(set.exitCode).toBe(0);

    const after = capture(["ds", "context", "--dir", tmp]);
    expect(after.exitCode).toBe(0);
    // background now has zero tokens → it moves to the gap list.
    expect(after.stdout).toMatch(/background.*\(no token/);
    expect(after.stdout).toContain("foreground → color.surface-content");
    expect(after.stdout).not.toContain("background → color.surface-content");
  });

  it("--format json exposes roles/roleGaps arrays", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-roles-json-"));
    importDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.roles).toContainEqual({ role: "background", paths: ["color.surface-content"] });
    expect(data.roleGaps).toContain("primary");
  });

  it("--format json: a DS with no baked roles returns empty roles/roleGaps arrays", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-roles-json-none-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--format", "json", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.roles).toEqual([]);
    expect(data.roleGaps).toEqual([]);
  });
});
