/**
 * `ui agents init|list|check` — command-layer behaviour through the CLI seam.
 * EASE_DESIGN_HOME is pinned to a fresh tmp dir for EVERY test (memory-store
 * plan invariant #5): agent naming reads the studio soul from that home.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

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

/** Compile a real DS named vsf-pcp into tmp (agents read the manifest name). */
function initDs(tmp: string): void {
  const r = capture([
    "ds", "init", "vsf-pcp",
    "--persona", "liquid-glass",
    "--intent", "agents test",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
    "--bare",
  ]);
  expect(r.exitCode).toBe(0);
}

/** Write a ratified studio soul (name: JANG) into the pinned test home. */
function writeStudioSoul(home: string): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "studio-soul.md"),
    `---\nstatus: ratified\nname: JANG\n---\n\n# Design Soul — studio\n\n## Never\n\n- generic stock photography\n\n## Always\n\n- display type at 44px or larger\n\n## Voice\n\n- direct, no filler\n`,
    "utf8",
  );
}

const agentPath = (tmp: string, file: string): string => join(tmp, ".claude", "agents", file);

// EASE_DESIGN_HOME pinned per test — every agents invocation resolves the
// studio soul through it (invariant #5 of memory-store).
const savedHome = process.env["EASE_DESIGN_HOME"];
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ease-agents-home-"));
  process.env["EASE_DESIGN_HOME"] = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

// ─── agents init ──────────────────────────────────────────────────────────────

describe("ui agents init", () => {
  it("with studio JANG + project vsf-pcp writes the genealogy-named trio", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);

    const r = capture(["agents", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("agents init");
    expect(env.data.agents).toEqual([
      { role: "designer", name: "designer-jang-vsf-pcp", path: agentPath(tmp, "designer-jang-vsf-pcp.md"), written: true },
      { role: "curator", name: "curator-jang-vsf-pcp", path: agentPath(tmp, "curator-jang-vsf-pcp.md"), written: true },
      { role: "figma-hand", name: "figma-jang-vsf-pcp", path: agentPath(tmp, "figma-jang-vsf-pcp.md"), written: true },
    ]);

    const designer = readFileSync(agentPath(tmp, "designer-jang-vsf-pcp.md"), "utf8");
    expect(designer).toContain("name: designer-jang-vsf-pcp");
    expect(designer).toContain("You are designer-jang-vsf-pcp, the designer agent for **vsf-pcp**.");
    expect(designer).toContain("You carry the JANG studio's soul as your base identity.");
    expect(designer).toMatch(/roster-role: designer · template-hash: [0-9a-f]{8}/);
    expect(designer).not.toContain("{{");
  });

  it("without a studio soul falls back to <project>-<role> and hints at --studio", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);

    const r = capture(["agents", "init", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(agentPath(tmp, "designer-vsf-pcp.md"))).toBe(true);
    expect(existsSync(agentPath(tmp, "curator-vsf-pcp.md"))).toBe(true);
    expect(existsSync(agentPath(tmp, "figma-vsf-pcp.md"))).toBe(true);
    expect(r.stdout).toContain("ui ds soul init --studio");
    expect(r.stdout).toContain("agents are Claude Code subagents — delegate with their names.");
    expect(readFileSync(agentPath(tmp, "designer-vsf-pcp.md"), "utf8")).not.toContain("studio's soul");
  });

  it("errors DS_NOT_FOUND (with the ds init hint) when the project has no manifest", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-nods-"));
    const r = capture(["agents", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.error.code).toBe("DS_NOT_FOUND");
    expect(env.error.message).toContain("ui ds init");
  });

  it("errors EXISTS on a re-init without --force (files preserved); --force regenerates", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);

    const p = agentPath(tmp, "designer-jang-vsf-pcp.md");
    writeFileSync(p, "hand-edited\n", "utf8");

    const r = capture(["agents", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.error.code).toBe("EXISTS");
    expect(env.error.message).toContain("designer-jang-vsf-pcp.md");
    expect(readFileSync(p, "utf8")).toBe("hand-edited\n");

    const rf = capture(["agents", "init", "--dir", tmp, "--force", "--json"]);
    expect(rf.exitCode).toBe(0);
    expect(readFileSync(p, "utf8")).toContain("You are designer-jang-vsf-pcp");
  });

  it("--roster subset writes only those roles; an unknown role is BAD_ARG naming the roster", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);

    const r = capture(["agents", "init", "--dir", tmp, "--roster", "designer,curator", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.agents.map((a: { role: string }) => a.role)).toEqual(["designer", "curator"]);
    expect(existsSync(agentPath(tmp, "figma-jang-vsf-pcp.md"))).toBe(false);

    const bad = capture(["agents", "init", "--dir", tmp, "--roster", "designer,researcher", "--force", "--json"]);
    expect(bad.exitCode).toBe(1);
    const env = JSON.parse(bad.stdout);
    expect(env.error.code).toBe("BAD_ARG");
    expect(env.error.message).toContain("researcher");
    expect(env.error.message).toContain("designer, curator, figma-hand");
  });
});

// ─── agents list ──────────────────────────────────────────────────────────────

describe("ui agents list", () => {
  it("lists the generated agents with role/hash/fresh", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);

    const r = capture(["agents", "list", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const agents = JSON.parse(r.stdout).data.agents as Array<{ name: string; role: string; hash: string; fresh: boolean }>;
    expect(agents).toHaveLength(3);
    expect(agents.map((a) => a.name).sort()).toEqual(["curator-jang-vsf-pcp", "designer-jang-vsf-pcp", "figma-jang-vsf-pcp"]);
    for (const a of agents) {
      expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
      expect(a.fresh).toBe(true);
    }
  });

  it("an agent-less project lists empty (exit 0) and points at init", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-empty-"));
    const r = capture(["agents", "list", "--dir", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no design-os agents");
    expect(r.stdout).toContain("ui agents init");
  });
});

// ─── agents check ─────────────────────────────────────────────────────────────

describe("ui agents check", () => {
  it("freshly generated agents check clean: 0 errors / 0 warnings, exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);

    const r = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(0);
    expect(data.warningCount).toBe(0);
    expect(data.findings).toEqual([]);
  });

  it("a 1-byte hand edit → agent-stale error, exit 1; init --force heals it", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);

    const p = agentPath(tmp, "curator-jang-vsf-pcp.md");
    writeFileSync(p, readFileSync(p, "utf8") + "x", "utf8");

    const r = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(1);
    expect(data.findings[0].checkId).toBe("agent-stale");
    expect(data.findings[0].message).toContain("curator-jang-vsf-pcp");
    expect(data.findings[0].message).toContain("ui agents init --force");

    capture(["agents", "init", "--dir", tmp, "--force"]);
    const healed = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(healed.exitCode).toBe(0);
    expect(JSON.parse(healed.stdout).data.findings).toEqual([]);
  });

  it("a pre-migration file (older template render) → agent-stale; init --force heals it", () => {
    // spec 002 WS-B: bumping templates/agents/*.md (the knowledge-guard line) changes
    // every template hash, so any file generated before the bump no longer matches the
    // live template render and must report stale — the migration the PR body documents
    // (`ui agents init --force` per project).
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);

    // Overwrite with a plausible OLD render: the designer body without the guard bullet,
    // carrying a valid designer stamp. Detection compares file-text hash vs the live
    // template render, so any prior-template content flags stale.
    const p = agentPath(tmp, "designer-jang-vsf-pcp.md");
    writeFileSync(
      p,
      "---\nname: designer-jang-vsf-pcp\n---\n\nYou are designer-jang-vsf-pcp, the designer agent for **vsf-pcp**." +
        " You carry the JANG studio's soul as your base identity.\n\nold pre-migration body\n\n" +
        "<!-- design-os agents · roster-role: designer · template-hash: deadbeef -->\n",
      "utf8",
    );

    const r = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(1);
    expect(data.findings[0].checkId).toBe("agent-stale");
    expect(data.findings[0].message).toContain("designer-jang-vsf-pcp");

    capture(["agents", "init", "--dir", tmp, "--force"]);
    const healed = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(healed.exitCode).toBe(0);
    expect(JSON.parse(healed.stdout).data.findings).toEqual([]);
  });

  it("no agents at all → the single no-agents warning, exit 0 (agents are opt-in)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);

    const r = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(0);
    expect(data.warningCount).toBe(1);
    expect(data.findings[0].checkId).toBe("no-agents");
  });

  it("a stamped file whose role left the roster → agent-unknown-role warning, exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);

    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      agentPath(tmp, "designer-jang-vsf-pcp-researcher.md"),
      "---\nname: designer-jang-vsf-pcp-researcher\n---\n\nold role\n\n<!-- design-os agents · roster-role: researcher · template-hash: 0123abcd -->\n",
      "utf8",
    );

    const r = capture(["agents", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(0);
    expect(data.warningCount).toBe(1);
    expect(data.findings[0].checkId).toBe("agent-unknown-role");
    expect(data.findings[0].message).toContain("researcher");
  });

  it("text mode renders the soul-check style summary + glyphs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-agents-"));
    initDs(tmp);
    writeStudioSoul(home);
    capture(["agents", "init", "--dir", tmp]);
    const p = agentPath(tmp, "designer-jang-vsf-pcp.md");
    writeFileSync(p, readFileSync(p, "utf8") + "x", "utf8");

    const r = capture(["agents", "check", "--dir", tmp]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("1 error(s), 0 warning(s)");
    expect(r.stdout).toContain("✗ [agent-stale]");
  });
});

// ─── dispatcher edges ─────────────────────────────────────────────────────────

describe("ui agents — routing", () => {
  it("no subcommand → BAD_ARG; unknown subcommand → BAD_ARG naming it", () => {
    const r1 = capture(["agents", "--json"]);
    expect(r1.exitCode).toBe(1);
    expect(JSON.parse(r1.stdout).error.code).toBe("BAD_ARG");

    const r2 = capture(["agents", "frobnicate", "--json"]);
    expect(r2.exitCode).toBe(1);
    const env = JSON.parse(r2.stdout);
    expect(env.error.code).toBe("BAD_ARG");
    expect(env.error.message).toContain("frobnicate");
  });

  it("rejects a hallucinated flag via the central guard", () => {
    const r = capture(["agents", "init", "--rooster", "designer", "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.error.code).toBe("UNKNOWN_FLAG");
    expect(env.error.message).toContain("--roster");
  });
});
