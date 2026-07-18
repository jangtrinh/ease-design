/**
 * `ui init --runtime` — write a sentinel manifest and the per-runtime adapter tree.
 *
 * hasSubcommands: false
 * --runtime <claude|antigravity|codex>  write one manifest + adapter tree (required unless --all)
 * --all                                  write all three
 * --cwd <path>                           target directory (default: process.cwd())
 * --force                                overwrite existing manifest and adapter files
 * --json                                 emit JsonEnvelope
 *
 * Side effects:
 *   1. Writes a JSON manifest under the target directory.
 *   2. Writes the runtime's adapter tree (slash-commands + skills, or AGENTS.md block).
 *   On any write failure every file written during this invocation is removed or
 *   restored so the project is left in a clean state (all-or-nothing across runtimes).
 */
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cwd as processCwd } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { scanProject } from "../core/project-scan.js";
import {
  RUNTIMES,
  buildManifest,
  manifestTargetPath,
  resolvePackageRoots,
} from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";
import { generateAdapter } from "../adapters/index.js";
import type { GenerateAdapterInput } from "../adapters/index.js";
import {
  writeAdapterArtifacts,
  AdapterWriteError,
  findSentinelBlock,
} from "../core/adapter-writer.js";
import {
  MODEL_ADAPTERS,
  modelWrapperRelPath,
} from "../core/model-adapter-registry.js";
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  JOURNEY_NAMES,
  resolveTemplatePath,
  hashTemplateFile,
} from "../adapters/templates.js";

const CMD = "init";

export const INIT_HELP = `ui init — write the ease-design manifest and per-runtime adapter tree

Usage:
  ui init --runtime <claude|antigravity|codex> [--cwd <path>] [--force] [--json]
  ui init --all [--cwd <path>] [--force] [--json]

Options:
  --runtime <r>  Target runtime: claude | antigravity | codex
  --all          Write manifests and adapter trees for all three runtimes
  --cwd <path>   Target directory (default: current working directory)
  --force        Overwrite existing manifest and adapter files
  --json         Emit a JSON envelope instead of writing to stderr
  -h, --help     Show this help

Output paths:
  claude      → <cwd>/.claude/ease-design.json
                <cwd>/.claude/commands/ui/*.md  (16 slash-commands)
                <cwd>/.claude/skills/design-os-*/SKILL.md  (11 skills: 8 craft + 3 journey)
  antigravity → <cwd>/.agent/ease-design.json
                <cwd>/.agent/workflows/ui-*.md  (16 workflows)
                <cwd>/.agent/skills/design-os-*/SKILL.md  (11 skills: 8 craft + 3 journey)
  codex       → <cwd>/AGENTS.ease-design.json
                <cwd>/AGENTS.md  (sentinel block appended/upserted)

Adapter tree: .claude/{commands/ui/,skills/design-os-*/} |
              .agent/{workflows/,skills/design-os-*/} |
              AGENTS.md (sentinel block).

Notes:
  - Without --force, writing to an already-existing path exits 1 (MANIFEST_EXISTS).
  - With --all: all-or-nothing — if any target exists without --force, the
    command errors listing every conflict before writing any file.
  - On any write failure all files written this invocation are removed or restored.

Error codes:
  BAD_ARG         Missing --runtime, unknown runtime, or --runtime + --all together
  UNKNOWN_FLAG    Unrecognised --flag (rejected, with a did-you-mean hint)
  MANIFEST_EXISTS Target file already exists (use --force to overwrite)
  WRITE_ERROR     File could not be written
`;

/**
 * Derive the post-install next-step hint by scanning the target project for
 * existing design signals. A brownfield project routes to /ui:learn; an empty
 * or DS-carrying one routes to /ui:generate. Best-effort: a scan failure must
 * never fail init, so the caller treats a null return as "omit the hint".
 */
function computeNextStepHint(
  cwd: string,
): { nextStep: "learn" | "generate"; hintLine: string } | null {
  try {
    const { verdict } = scanProject(cwd);
    if (verdict === "brownfield-code" || verdict === "brownfield-html") {
      return { nextStep: "learn", hintLine: "next: existing UI detected — run /ui:learn" };
    }
    if (verdict === "ds-present") {
      return { nextStep: "generate", hintLine: "next: design system already present — /ui:generate" };
    }
    return { nextStep: "generate", hintLine: 'next: run /ui:generate "<your idea>"' };
  } catch {
    return null;
  }
}

export const initCommand = {
  name: CMD,
  summary: "Write the ease-design manifest and per-runtime adapter tree",
  hasSubcommands: false,
  help: INIT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // ── Reject unknown flags (loud misconfig beats a silent no-op) ─────────
    const unknown = findUnknownFlag(parsed.flags, ["runtime", "all", "cwd", "force"]);
    if (unknown !== null) {
      const msg = unknownFlagMessage(unknown);
      return useJson ? errJson(CMD, "UNKNOWN_FLAG", msg) : errText(`ui: ${msg}\n`);
    }

    const force = parsed.flags["force"] === true;
    const useAll = parsed.flags["all"] === true;
    const runtimeFlag = parsed.flags["runtime"];

    // ── Validate flag combination ──────────────────────────────────────────
    if (useAll && typeof runtimeFlag === "string") {
      const msg = "--runtime and --all are mutually exclusive";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (!useAll && typeof runtimeFlag !== "string") {
      const msg = "ui init requires --runtime <claude|antigravity|codex> or --all";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // ── Validate runtime value ─────────────────────────────────────────────
    const runtimes: Runtime[] = useAll
      ? [...RUNTIMES]
      : [runtimeFlag as string].map((r) => {
          if (!RUNTIMES.includes(r as Runtime)) return null;
          return r as Runtime;
        }).filter((r): r is Runtime => r !== null);

    if (!useAll && runtimes.length === 0) {
      const msg = `unknown runtime '${String(runtimeFlag)}'; must be one of: ${RUNTIMES.join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // ── Resolve target directory ───────────────────────────────────────────
    const cwdFlag = parsed.flags["cwd"];
    const targetCwd = typeof cwdFlag === "string" ? resolve(cwdFlag) : processCwd();

    // ── Resolve package roots (templates/ + knowledge/) ────────────────────
    // Shared with `ui doctor` via resolvePackageRoots (init-stub.ts). Walks up
    // from this file to the ease-design package root, identified by the sentinel
    // templates/workflows/generate.md.
    const thisFile = fileURLToPath(import.meta.url);
    const startDir = dirname(thisFile);
    const { templatesRoot, knowledgeRoot } = resolvePackageRoots(startDir);

    if (templatesRoot === null || knowledgeRoot === null) {
      const msg = `ease-design templates not found (searched upward from ${startDir})`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    const binaryPath = "ui";
    // knowledge/ ships inside the package as a sibling of templates/ — anchor to
    // the package root, NOT the consumer's project dir (resolve(targetCwd,
    // "knowledge") was the bug: that path doesn't exist in a consumer project).
    const knowledgePath = knowledgeRoot;

    // ── Pre-flight: collect manifest entries ───────────────────────────────
    type ManifestEntry = {
      runtime: Runtime;
      path: string;
      exists: boolean;
    };
    const entries: ManifestEntry[] = runtimes.map((runtime) => ({
      runtime,
      path: manifestTargetPath(targetCwd, runtime),
      exists: false,
    }));
    for (const entry of entries) {
      entry.exists = existsSync(entry.path);
    }

    // ── Pre-flight: generate adapter artifact lists + check collisions ─────
    type RuntimeAdapters = {
      runtime: Runtime;
      artifacts: ReturnType<typeof generateAdapter>;
    };
    const runtimeAdapters: RuntimeAdapters[] = [];

    for (const entry of entries) {
      let artifacts: ReturnType<typeof generateAdapter>;
      const adapterInput: GenerateAdapterInput = {
        runtime: entry.runtime,
        cwd: targetCwd,
        templatesRoot,
      };
      try {
        artifacts = generateAdapter(adapterInput);
      } catch (e) {
        const msg = `adapter generation failed for '${entry.runtime}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
      runtimeAdapters.push({ runtime: entry.runtime, artifacts });
    }

    if (!force) {
      // Collect manifest conflicts
      const manifestConflicts = entries
        .filter((e) => e.exists)
        .map((e) => e.path);

      // Collect adapter conflicts
      const adapterConflicts: string[] = [];
      for (const { artifacts } of runtimeAdapters) {
        for (const art of artifacts) {
          if (art.mode === "write") {
            if (existsSync(art.absPath)) {
              adapterConflicts.push(art.absPath);
            }
          } else {
            // upsert-section: conflict only if the sentinel block already exists
            if (existsSync(art.absPath)) {
              const content = readFileSync(art.absPath, "utf8");
              if (
                findSentinelBlock(content, art.sentinelBegin, art.sentinelEnd) !==
                null
              ) {
                adapterConflicts.push(art.absPath);
              }
            }
          }
        }
      }

      if (manifestConflicts.length > 0 || adapterConflicts.length > 0) {
        let msg: string;
        if (manifestConflicts.length > 0 && adapterConflicts.length === 0) {
          const listed = manifestConflicts.map((p) => `'${p}'`).join(", ");
          msg = manifestConflicts.length === 1
            ? `manifest already exists at ${listed} (use --force to overwrite)`
            : `manifests already exist at ${listed} (use --force to overwrite)`;
        } else if (manifestConflicts.length === 0 && adapterConflicts.length > 0) {
          const listed = adapterConflicts.map((p) => `'${p}'`).join(", ");
          msg = `ease-design files already present — run with --force to overwrite: ${listed}`;
        } else {
          const mListed = manifestConflicts.map((p) => `'${p}'`).join(", ");
          const aListed = adapterConflicts.map((p) => `'${p}'`).join(", ");
          msg = `ease-design files already present — run with --force to overwrite: manifest: ${mListed}; adapter files: ${aListed}`;
        }
        return useJson ? errJson(CMD, "MANIFEST_EXISTS", msg) : errText(`ui: ${msg}\n`);
      }
    }

    // ── Write phase ────────────────────────────────────────────────────────
    // Track every file written across all runtimes for cross-runtime rollback.
    // On any failure, all manifests + all adapter files written so far are
    // removed or restored so the project is left in a clean state.
    const manifests: {
      runtime: Runtime;
      path: string;
      written: boolean;
      replaced: boolean;
    }[] = [];
    const adapterResults: { runtime: Runtime; paths: string[] }[] = [];

    const allWrittenManifests: string[] = [];
    // Per-runtime adapter artifacts that were successfully written (flat list
    // across all runtimes processed so far, used for cross-runtime rollback).
    const allWrittenAdapterPaths: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const { artifacts } = runtimeAdapters[i]!;

      // Build template hashes for the manifest (all non-init workflows + skills + journeys).
      // Keys here and adapter-lint.ts's liveTemplateHashes() MUST enumerate the same
      // registries — an asymmetry makes `ui doctor` template-drift false-fail/false-pass.
      const templateHashes: Record<string, string> = {};
      for (const verb of WORKFLOW_VERBS) {
        if (verb === "init") continue;
        const absPath = resolveTemplatePath(templatesRoot, "workflow", verb);
        if (absPath !== null) {
          templateHashes[`workflows/${verb}.md`] = hashTemplateFile(absPath);
        }
      }
      for (const name of SKILL_NAMES) {
        const absPath = resolveTemplatePath(templatesRoot, "skill", name);
        if (absPath !== null) {
          templateHashes[`skills/${name}.md`] = hashTemplateFile(absPath);
        }
      }
      for (const name of JOURNEY_NAMES) {
        const absPath = resolveTemplatePath(templatesRoot, "journey", name);
        if (absPath !== null) {
          templateHashes[`journeys/${name}.md`] = hashTemplateFile(absPath);
        }
      }

      // The model-adapter wrapper (spec 013 P1) is generated alongside the rest of
      // the tree (so it shares the same write/rollback/collision pipeline below)
      // but is excluded from `adapters[]` — see generateAdapter()'s doc comment.
      const wrapperAbsPath = join(targetCwd, modelWrapperRelPath(entry.runtime));
      const nonWrapperArtifacts = artifacts.filter((a) => a.absPath !== wrapperAbsPath);

      // Build relative adapter paths for the manifest
      const adapterRelPaths = nonWrapperArtifacts.map((a) => {
        return a.absPath.startsWith(targetCwd)
          ? a.absPath.slice(targetCwd.length).replace(/^[\\/]/, "")
          : a.absPath;
      });

      const manifest = buildManifest({
        runtime: entry.runtime,
        binaryPath,
        knowledgePath,
        now: () => new Date(),
        status: "ready",
        adapters: adapterRelPaths,
        templateHashes,
        modelAdapter: {
          runtime: entry.runtime,
          wrapper: modelWrapperRelPath(entry.runtime),
          mode: MODEL_ADAPTERS[entry.runtime].mode,
          // Date the invocations in model-adapter-registry.ts were live-probed
          // (specs/013-host-model-fuel-line/plan.md's verified adapter table).
          verifiedAt: "2026-07-18",
        },
      });

      // Write the manifest first
      try {
        mkdirSync(dirname(entry.path), { recursive: true });
        writeFileSync(
          entry.path,
          JSON.stringify(manifest, null, 2) + "\n",
          "utf8",
        );
        allWrittenManifests.push(entry.path);
      } catch (e) {
        // Roll back all manifests + all adapter files written so far
        for (const p of [...allWrittenManifests, ...allWrittenAdapterPaths]) {
          try { unlinkSync(p); } catch { /* best-effort */ }
        }
        const msg = `cannot write '${entry.path}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }

      // Write the adapter tree; on failure roll back manifest + all prior writes
      let writeResults: ReturnType<typeof writeAdapterArtifacts>;
      try {
        writeResults = writeAdapterArtifacts(artifacts, { force });
      } catch (e) {
        // Remove the manifest just written + all prior manifests + all adapter files
        for (const p of [...allWrittenManifests, ...allWrittenAdapterPaths]) {
          try { unlinkSync(p); } catch { /* best-effort */ }
        }
        const code =
          e instanceof AdapterWriteError ? e.code : "WRITE_ERROR";
        const msg =
          e instanceof AdapterWriteError
            ? e.message
            : `adapter write failed: ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
      }

      // Record the paths that were newly written (not just replaced) for rollback
      for (const r of writeResults) {
        if (r.written) allWrittenAdapterPaths.push(r.path);
      }

      manifests.push({
        runtime: entry.runtime,
        path: entry.path,
        written: true,
        replaced: entry.exists,
      });
      adapterResults.push({
        runtime: entry.runtime,
        paths: nonWrapperArtifacts.map((a) => a.absPath),
      });
    }

    // ── Next-step hint (best-effort scan of the target project) ────────────
    const hint = computeNextStepHint(targetCwd);

    // ── Emit result ────────────────────────────────────────────────────────
    if (useJson) {
      const data: Record<string, unknown> = { manifests, adapters: adapterResults };
      if (hint !== null) data.nextStep = hint.nextStep;
      return okJson(CMD, data);
    }

    const lines = manifests
      .map((m, idx) => {
        const adapterPaths = adapterResults[idx]?.paths ?? [];
        const dir =
          m.runtime === "claude"
            ? join(targetCwd, ".claude")
            : m.runtime === "antigravity"
            ? join(targetCwd, ".agent")
            : targetCwd;
        return (
          `manifest written: ${m.path}\n` +
          `adapters written: ${adapterPaths.length} files under ${dir}\n` +
          `model adapter: ${modelWrapperRelPath(m.runtime)} (${MODEL_ADAPTERS[m.runtime].mode})`
        );
      })
      .join("\n");
    let body = hint !== null ? `${lines}\n${hint.hintLine}` : lines;
    // Agents are opt-in (never auto-generated) — Claude Code installs get one hint line.
    if (runtimes.includes("claude")) {
      body += "\noptional: `ui agents init` gives this project soul-bound task agents";
    }
    return { exitCode: 0, stderr: body + "\n" };
  },
};
