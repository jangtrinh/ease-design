/**
 * `ui doctor` command — install & project health check.
 *
 * A first-run smoke test that verifies an ease-design install actually works,
 * so neither a designer nor a developer hits a silent setup failure. Checks:
 *   1. Node.js >= 20 (the engines floor).
 *   2. The bundled package roots (templates/ + knowledge/) resolve, with the
 *      key knowledge files present — this is what the host model reads.
 *   3. (Optional, --cwd) a target project's adapter manifest exists, is well
 *      formed, and records a knowledgePath that still resolves on disk.
 *
 * Read-only: never writes. Exit 0 when everything passes, 1 when any check
 * fails (or a warn-only run with --json still reports structured results).
 * No subcommands — hasSubcommands: false.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { versions } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { okJsonWithExit } from "../core/output.js";
import { resolvePackageRoots, RUNTIMES, manifestTargetPath } from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";
import { lintProjectAdapters } from "../core/adapter-lint.js";

const CMD = "doctor";

export const DOCTOR_HELP = `ui doctor — verify an ease-design install (and optionally a project) is healthy

Usage:
  ui doctor [--cwd <project-dir>] [--json]

Options:
  --cwd <path>  Also check the adapter install in this project directory
  --json        Emit a JSON envelope instead of human-readable output
  -h, --help    Show this help

Checks:
  node-version       Node.js >= 20 (engines floor)
  templates-root     bundled templates/ resolves from the binary
  knowledge-root     bundled knowledge/ resolves with key files present
  project-manifest   (with --cwd) an adapter manifest exists and is well formed
  project-knowledge  (with --cwd) the manifest's knowledgePath resolves on disk
  template-drift     (with --cwd) live templates still match the installed hashes
                     — a mismatch means 'ui init --force' was not re-run after a
                     templates/ edit, leaving this runtime's wrappers stale
  adapter-wrappers   (with --cwd) each generated wrapper exists, has frontmatter,
                     points at a resolvable template, and (Antigravity) marks each
                     bash block // turbo / (Codex) has one sentinel pair

A '!' mark is a warning (e.g. an old manifest without recorded hashes); warnings
do not fail the run.

Exit codes:
  0  All checks passed (warnings allowed)
  1  One or more checks failed
`;

// ─── Check model ────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "warn" | "fail";
interface Check {
  id: string;
  status: CheckStatus;
  detail: string;
}

const KEY_KNOWLEDGE_FILES = [
  "persona-index.md",
  "taste-rubric.md",
  "token-taxonomy.md",
  "component-catalog.md",
];

// ─── Individual checks (pure-ish: fs reads only) ─────────────────────────────────

function checkNodeVersion(): Check {
  const major = parseInt((versions.node ?? "0").split(".")[0] ?? "0", 10);
  return major >= 20
    ? { id: "node-version", status: "pass", detail: `Node ${versions.node} (>= 20)` }
    : { id: "node-version", status: "fail", detail: `Node ${versions.node} is below the required >= 20` };
}

function checkTemplatesRoot(templatesRoot: string | null): Check {
  if (templatesRoot === null) {
    return { id: "templates-root", status: "fail",
      detail: "templates/ not found — the install is incomplete (run from a built clone or reinstall)" };
  }
  return { id: "templates-root", status: "pass", detail: templatesRoot };
}

function checkKnowledgeRoot(knowledgeRoot: string | null): Check {
  if (knowledgeRoot === null || !existsSync(knowledgeRoot)) {
    return { id: "knowledge-root", status: "fail",
      detail: `knowledge/ not found${knowledgeRoot ? ` at ${knowledgeRoot}` : ""} — the host model has nothing to read` };
  }
  const missing = KEY_KNOWLEDGE_FILES.filter((f) => !existsSync(join(knowledgeRoot, f)));
  if (missing.length > 0) {
    return { id: "knowledge-root", status: "fail",
      detail: `knowledge/ is missing key files: ${missing.join(", ")}` };
  }
  return { id: "knowledge-root", status: "pass",
    detail: `${knowledgeRoot} (${KEY_KNOWLEDGE_FILES.length} key files present)` };
}

/** Find the first runtime manifest present under cwd; returns its path or null. */
function findProjectManifest(cwd: string): { runtime: Runtime; path: string } | null {
  for (const runtime of RUNTIMES) {
    const p = manifestTargetPath(cwd, runtime);
    if (existsSync(p)) return { runtime, path: p };
  }
  return null;
}

interface ProjectManifestChecks {
  manifest: Check;
  knowledge: Check;
  /** The parsed manifest object when readable, else null — fed to the adapter lint. */
  parsed: Record<string, unknown> | null;
}

function checkProjectManifest(cwd: string): ProjectManifestChecks {
  const found = findProjectManifest(cwd);
  if (found === null) {
    const fail: Check = { id: "project-manifest", status: "fail",
      detail: `no ease-design adapter manifest under ${cwd} — run 'ui init --runtime <r>' there first` };
    return { manifest: fail, parsed: null, knowledge: { id: "project-knowledge", status: "fail",
      detail: "skipped — no manifest to read knowledgePath from" } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(found.path, "utf8"));
  } catch {
    const fail: Check = { id: "project-manifest", status: "fail",
      detail: `manifest at ${found.path} is not valid JSON` };
    return { manifest: fail, parsed: null, knowledge: { id: "project-knowledge", status: "fail",
      detail: "skipped — manifest unreadable" } };
  }
  // A manifest that parses to `null` or a non-object (e.g. a bare literal) would
  // crash on the field reads below — treat it as malformed, not internal-error.
  if (raw === null || typeof raw !== "object") {
    const fail: Check = { id: "project-manifest", status: "fail",
      detail: `manifest at ${found.path} is not a JSON object` };
    return { manifest: fail, parsed: null, knowledge: { id: "project-knowledge", status: "fail",
      detail: "skipped — manifest is not an object" } };
  }
  const parsed = raw as Record<string, unknown>;

  const manifest: Check = { id: "project-manifest", status: "pass",
    detail: `${found.runtime} manifest at ${found.path}` };

  const kp = parsed["knowledgePath"];
  let knowledge: Check;
  if (typeof kp !== "string" || kp.length === 0) {
    knowledge = { id: "project-knowledge", status: "fail",
      detail: "manifest has no knowledgePath" };
  } else if (!existsSync(join(kp, "persona-index.md"))) {
    knowledge = { id: "project-knowledge", status: "fail",
      detail: `manifest knowledgePath does not resolve: ${kp} (knowledge core unreachable for this project)` };
  } else {
    knowledge = { id: "project-knowledge", status: "pass", detail: kp };
  }
  return { manifest, knowledge, parsed };
}

// ─── Report formatting ──────────────────────────────────────────────────────────

function formatReport(checks: Check[], failCount: number): string {
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const lines: string[] = ["ui doctor — ease-design health check", ""];
  for (const c of checks) {
    const mark = c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗";
    lines.push(`  ${mark} ${c.id}: ${c.detail}`);
  }
  lines.push("");
  if (failCount > 0) {
    lines.push(`${failCount} check(s) failed — see above.`);
  } else if (warnCount > 0) {
    lines.push(`All checks passed with ${warnCount} warning(s) — ease-design is ready.`);
  } else {
    lines.push("All checks passed — ease-design is ready.");
  }
  return lines.join("\n") + "\n";
}

// ─── Command handler ──────────────────────────────────────────────────────────

export const doctorCommand = {
  name: CMD,
  summary: "Verify an ease-design install (and optionally a project) is healthy",
  hasSubcommands: false,
  help: DOCTOR_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const startDir = dirname(fileURLToPath(import.meta.url));
    const { templatesRoot, knowledgeRoot } = resolvePackageRoots(startDir);

    const checks: Check[] = [
      checkNodeVersion(),
      checkTemplatesRoot(templatesRoot),
      checkKnowledgeRoot(knowledgeRoot),
    ];

    // Optional project check (--cwd <path> or a bare positional path).
    const cwdFlag = parsed.flags["cwd"];
    const target = typeof cwdFlag === "string" ? cwdFlag : parsed.positionals[0];
    if (target !== undefined) {
      const proj = checkProjectManifest(target);
      checks.push(proj.manifest, proj.knowledge);
      // Only lint the adapter tree when the manifest parsed — otherwise the
      // manifest check above already reports the real problem.
      if (proj.parsed !== null) {
        checks.push(
          ...lintProjectAdapters({ cwd: target, templatesRoot, manifest: proj.parsed }),
        );
      }
    }

    const failCount = checks.filter((c) => c.status === "fail").length;
    const exitCode = failCount > 0 ? 1 : 0;

    if (useJson) {
      return okJsonWithExit(CMD, { healthy: failCount === 0, failCount, checks }, exitCode);
    }
    return { exitCode, stdout: formatReport(checks, failCount) };
  },
};
