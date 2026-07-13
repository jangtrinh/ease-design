/**
 * Built-binary smoke test for `ui init`.
 *
 * Spawns `node dist/cli.js` as a subprocess to catch production-binary bugs
 * that are invisible to vitest because vitest imports source files directly.
 * The canonical example: templates/ path resolution differs between the bundled
 * single-file dist/cli.js and the multi-file src/ layout — source imports mask
 * the bug entirely.
 *
 * Skips with a clear message when dist/cli.js has not been built yet (CI builds
 * before running tests, so this only happens during local development).
 */
import { describe, expect, it, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
} from "node:fs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const p = join(tmpdir(), `binary-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(p, { recursive: true });
  tmpDirs.push(p);
  return p;
}

afterEach(() => {
  for (const d of tmpDirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

/** Run `node dist/cli.js <args>` synchronously, return exit code + stdout. */
function spawnBinary(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [DIST_CLI, ...args], { encoding: "utf8" });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("built binary: ui init --runtime claude", () => {
  it("dist/cli.js exists — if this fails, run `npm run build` first", () => {
    if (!existsSync(DIST_CLI)) {
      // Explicit skip with a message rather than a silent pass or cryptic error.
      console.warn(`SKIP: ${DIST_CLI} not found — run "npm run build" to generate it.`);
    }
    expect(existsSync(DIST_CLI), `dist/cli.js missing — run "npm run build"`).toBe(true);
  });

  it("exits 0 and writes the manifest + adapter tree", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    const { code, stdout } = spawnBinary(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);

    expect(code, `non-zero exit; stdout: ${stdout}`).toBe(0);

    const json = JSON.parse(stdout) as {
      ok: boolean;
      data: {
        manifests: { runtime: string; path: string; written: boolean }[];
        adapters: { runtime: string; paths: string[] }[];
      };
    };
    expect(json.ok).toBe(true);

    // Manifest written
    expect(json.data.manifests).toHaveLength(1);
    expect(json.data.manifests[0]?.written).toBe(true);
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(true);

    // Adapter tree written — 24 files (16 workflows + 8 skills)
    expect(json.data.adapters[0]?.paths.length).toBe(24);
    expect(existsSync(join(cwd, ".claude", "commands", "ui", "generate.md"))).toBe(true);
    expect(existsSync(join(cwd, ".claude", "skills", "ease-design-pick-persona", "SKILL.md"))).toBe(true);
  });

  it("adapter content references an existing templates/ path (no dangling pointer)", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    spawnBinary(["init", "--runtime", "claude", "--cwd", cwd]);

    const generateMd = join(cwd, ".claude", "commands", "ui", "generate.md");
    expect(existsSync(generateMd)).toBe(true);

    const content = readFileSync(generateMd, "utf8");
    // The wrapper must embed an absolute path to templates/workflows/generate.md
    // and that path must exist on disk (no dangling pointer from wrong resolution).
    const match = content.match(/`([^`]*templates\/workflows\/generate\.md)`/);
    expect(match, "generate.md wrapper must reference templates/workflows/generate.md").not.toBeNull();
    const embeddedPath = match![1]!;
    expect(existsSync(embeddedPath), `embedded template path does not exist: ${embeddedPath}`).toBe(true);
  });

  it("second run without --force exits 1 with MANIFEST_EXISTS", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    spawnBinary(["init", "--runtime", "claude", "--cwd", cwd]);
    const { code, stdout } = spawnBinary(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);

    expect(code).toBe(1);
    const json = JSON.parse(stdout) as { error: { code: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
  });

  it("--force rewrites adapter files", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    spawnBinary(["init", "--runtime", "claude", "--cwd", cwd]);
    const { code } = spawnBinary(["init", "--runtime", "claude", "--cwd", cwd, "--force", "--json"]);
    expect(code).toBe(0);
  });
});

describe("built binary: ui init --runtime antigravity", () => {
  it("exits 0 and writes .agent adapter tree", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    const { code, stdout } = spawnBinary(["init", "--runtime", "antigravity", "--cwd", cwd, "--json"]);

    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { ok: boolean; data: { adapters: { paths: string[] }[] } };
    expect(json.ok).toBe(true);
    expect(json.data.adapters[0]?.paths.length).toBe(24);
    expect(existsSync(join(cwd, ".agent", "workflows", "ui-generate.md"))).toBe(true);
    expect(existsSync(join(cwd, ".agent", "workflows", "ui-from-url.md"))).toBe(true);
  });
});

describe("built binary: ui init --runtime codex", () => {
  it("exits 0 and writes AGENTS.md with sentinel block", () => {
    if (!existsSync(DIST_CLI)) return;

    const cwd = makeTmpDir();
    const { code } = spawnBinary(["init", "--runtime", "codex", "--cwd", cwd]);

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
    const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    expect(content).toContain("<!-- BEGIN ease-design -->");
    expect(content).toContain("<!-- END ease-design -->");
  });
});

// ── Sentinel sniff: decoy templates/ must not be accepted ─────────────────────
//
// The binary resolves templates/ relative to its own file (dist/cli.js), not
// relative to --cwd. To test the sentinel-sniff walk we therefore need to
// place the binary in a directory where a decoy templates/ (lacking the
// sentinel file) appears before the real one.
//
// We do this by:
//   1. Creating a tmp tree: tmp/fake-pkg/dist/ (copy of dist/cli.js)
//                            tmp/fake-pkg/templates/ (decoy — NO generate.md)
//      → the walk finds tmp/fake-pkg/templates/ at hop 1, but rejects it.
//   2. Placing the real templates one level higher: tmp/templates/ (real).
//      → the walk skips the decoy and accepts tmp/templates/ at hop 2.
//   3. Running tmp/fake-pkg/dist/cli.js init --runtime claude --cwd <empty tmp>
//      and asserting exit 0 (real templates found despite the decoy).
//
// A complementary test runs the same binary with NO real templates anywhere in
// the search path and asserts exit 1 + WRITE_ERROR + the new sentinel-aware
// error message (proving the sentinel check fires).

describe("templates walk: sentinel sniff rejects decoy and finds real templates", () => {
  it("skips a decoy templates/ lacking workflows/generate.md and uses the real one", () => {
    if (!existsSync(DIST_CLI)) return;

    const root = makeTmpDir();

    // Real templates: symlink from root/templates → repo templates/
    // (symlink avoids copying ~300 KB of markdown files)
    const repoTemplates = join(REPO_ROOT, "templates");
    const realTemplatesLink = join(root, "templates");
    symlinkSync(repoTemplates, realTemplatesLink, "dir");

    // fake-pkg/dist/cli.js — copy the real binary one level deeper
    const fakePkgDir = join(root, "fake-pkg");
    const fakeDistDir = join(fakePkgDir, "dist");
    mkdirSync(fakeDistDir, { recursive: true });
    copyFileSync(DIST_CLI, join(fakeDistDir, "cli.js"));

    // Decoy templates inside fake-pkg/ — exists but lacks workflows/generate.md
    const decoyTemplates = join(fakePkgDir, "templates");
    mkdirSync(join(decoyTemplates, "workflows"), { recursive: true });
    writeFileSync(join(decoyTemplates, "workflows", "unrelated.md"), "not generate", "utf8");

    // Run the fake binary
    const cwd = makeTmpDir();
    const result = spawnSync(
      "node",
      [join(fakeDistDir, "cli.js"), "init", "--runtime", "claude", "--cwd", cwd, "--json"],
      { encoding: "utf8" },
    );

    expect(
      result.status,
      `expected exit 0 but got ${result.status}; stdout: ${result.stdout}`,
    ).toBe(0);
    expect(existsSync(join(cwd, ".claude", "commands", "ui", "generate.md"))).toBe(true);

    // The adapter must reference the real templates, not the decoy
    const generated = readFileSync(join(cwd, ".claude", "commands", "ui", "generate.md"), "utf8");
    expect(generated).not.toContain(decoyTemplates.replace(/\\/g, "/"));
    expect(generated).toContain("workflows/generate.md");
  });

  it("returns WRITE_ERROR with sentinel-aware message when no valid templates/ is found", () => {
    if (!existsSync(DIST_CLI)) return;

    const root = makeTmpDir();

    // fake-pkg/dist/cli.js — isolated binary with no real templates above it
    const fakeDistDir = join(root, "fake-pkg", "dist");
    mkdirSync(fakeDistDir, { recursive: true });
    copyFileSync(DIST_CLI, join(fakeDistDir, "cli.js"));

    // Decoy only — no workflows/generate.md anywhere above the binary
    const decoy = join(root, "fake-pkg", "templates");
    mkdirSync(join(decoy, "workflows"), { recursive: true });
    writeFileSync(join(decoy, "workflows", "other.md"), "not generate", "utf8");

    const cwd = makeTmpDir();
    const result = spawnSync(
      "node",
      [join(fakeDistDir, "cli.js"), "init", "--runtime", "claude", "--cwd", cwd, "--json"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const json = JSON.parse(result.stdout) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("WRITE_ERROR");
    // New sentinel-aware message: "ease-design templates not found (searched … .. …)"
    expect(json.error.message).toContain("ease-design templates not found");
    expect(json.error.message).toContain("searched");
  });
});
