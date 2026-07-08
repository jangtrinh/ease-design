/**
 * Wrapper-integrity half of the `ui doctor --cwd` adapter lint (see adapter-lint.ts
 * for the template-drift half + the shared entry point).
 *
 * Lints each generated per-runtime wrapper the manifest recorded: it must exist,
 * carry YAML frontmatter, point at a template that still resolves on disk, mark
 * every Antigravity bash block with `// turbo`, and (Codex) hold exactly one
 * ease-design sentinel pair.
 *
 * Pure except fs reads (existsSync/readFileSync). No writes, no network.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END } from "../adapters/wrapper-shapes.js";
import type { AdapterLintCheck, ReadManifest } from "./adapter-lint.js";

const TEMPLATE_REF_RE = /`([^`]+\.md)`/g;
const BASH_FENCE_RE = /^```bash\s*$/;
const TURBO_RE = /^\/\/\s*turbo\s*$/;

function fwd(p: string): string {
  return p.replace(/\\/g, "/");
}

/** True for the synthetic init wrapper, which points at no template file. */
function isInitWrapper(rel: string): boolean {
  const base = fwd(rel).split("/").pop() ?? "";
  return base === "init.md" || base === "ui-init.md";
}

/** Lint one wrapper file; returns a problem string or null when clean. */
function lintWrapper(cwd: string, rel: string): string | null {
  const relFwd = fwd(rel);
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return `${relFwd} is missing (re-run 'ui init --force')`;

  const content = readFileSync(abs, "utf8");
  const isCodex = relFwd.endsWith("AGENTS.md");

  if (isCodex) {
    const begins = content.split(CODEX_SENTINEL_BEGIN).length - 1;
    const ends = content.split(CODEX_SENTINEL_END).length - 1;
    if (begins !== 1 || ends !== 1) {
      return `${relFwd} has ${begins} begin / ${ends} end ease-design sentinels (expected exactly 1 pair)`;
    }
    return null;
  }

  // Claude / Antigravity workflow + skill wrappers all carry YAML frontmatter.
  if (!content.startsWith("---")) return `${relFwd} is missing YAML frontmatter`;

  // Non-init wrappers must point at a template that still resolves on disk.
  if (!isInitWrapper(relFwd)) {
    const refs = [...content.matchAll(TEMPLATE_REF_RE)]
      .map((m) => m[1] as string)
      .filter((p) => fwd(p).includes("/templates/"));
    if (refs.length === 0) return `${relFwd} does not reference its runtime-neutral template`;
    const missing = refs.filter((p) => !existsSync(p));
    if (missing.length > 0) return `${relFwd} points at a template that no longer exists: ${missing.join(", ")}`;
  }

  // Antigravity workflow wrappers auto-run shell — every bash fence needs `// turbo`.
  if (relFwd.includes("/.agent/workflows/") || relFwd.includes("/workflows/ui-")) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (BASH_FENCE_RE.test(lines[i] ?? "")) {
        let j = i - 1;
        while (j >= 0 && (lines[j] ?? "").trim() === "") j--;
        if (j < 0 || !TURBO_RE.test((lines[j] ?? "").trim())) {
          return `${relFwd} has a bash block at line ${i + 1} without a preceding '// turbo' marker`;
        }
      }
    }
  }

  return null;
}

/** Lint every wrapper file the manifest recorded for this project. */
export function checkWrappers(cwd: string, manifest: ReadManifest): AdapterLintCheck {
  const adapters = manifest.adapters;
  if (!Array.isArray(adapters) || adapters.length === 0) {
    return {
      id: "adapter-wrappers",
      status: "warn",
      detail: "manifest lists no adapter files — run 'ui init --force' to (re)generate the wrapper tree",
    };
  }
  const problems: string[] = [];
  for (const rel of adapters) {
    if (typeof rel !== "string") continue;
    const problem = lintWrapper(cwd, rel);
    if (problem !== null) problems.push(problem);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5);
    const extra = problems.length > shown.length ? ` (+${problems.length - shown.length} more)` : "";
    return { id: "adapter-wrappers", status: "fail", detail: shown.join("; ") + extra };
  }
  return { id: "adapter-wrappers", status: "pass", detail: `${adapters.length} wrapper file(s) well-formed` };
}
