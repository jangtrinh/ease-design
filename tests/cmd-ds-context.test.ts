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

  it("--max-bytes 600 truncates output to at most 600 bytes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-"));
    initDs(tmp);
    const r = capture(["ds", "context", "--dir", tmp, "--max-bytes", "600"]);
    expect(r.exitCode).toBe(0);
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(600);
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

  it("a project without soul.md just omits the section — never an error", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-soul-"));
    initDs(tmp);
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Soul");
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

  it("neither: no studio file and no project soul.md → soul is omitted entirely, never an error", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ctx-studio-"));
    initDs(tmp, true);
    rmSync(join(tmp, "design", "soul.md"));
    const r = capture(["ds", "context", "--dir", tmp, "--include", "soul"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("## Soul");
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
