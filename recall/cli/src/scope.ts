/**
 * Index scope resolution — two separate indexes (owner decision).
 *
 *   project  <project>/design/memory.vec.db       recall within one design system
 *   home     <EASE_DESIGN_HOME>/taste.vec.db      recall across every registered project
 *
 * Isolation is the point: deleting a project deletes its index with it, and the
 * cross-project index is namespaced so a home hit can never be mistaken for a local
 * ledger id. Both files are rebuildable views (boundary invariant #2).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ScopeKind = "project" | "home";

export interface Scope {
  kind: ScopeKind;
  dbPath: string;
  /** Only set for the project scope. */
  projectDir?: string;
}

/** Mirrors the binary's `easeHome()` so both agree on the user-scope root. */
export function easeHome(): string {
  const env = process.env["EASE_DESIGN_HOME"];
  return env !== undefined && env.length > 0 ? resolve(env) : join(homedir(), ".ease-design");
}

export function projectScope(dir?: string): Scope {
  const projectDir = dir !== undefined ? resolve(dir) : process.cwd();
  return { kind: "project", projectDir, dbPath: join(projectDir, "design", "memory.vec.db") };
}

export function homeScope(): Scope {
  return { kind: "home", dbPath: join(easeHome(), "taste.vec.db") };
}

export interface ProjectEntry {
  name: string;
  path: string;
  lastEventAt?: string;
}

/** The projects `ui memory record` has registered. Absent registry → no projects. */
export function loadRegistry(): ProjectEntry[] {
  const p = join(easeHome(), "projects.json");
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, "utf8")) as unknown;
    if (!Array.isArray(arr)) return [];
    return (arr as ProjectEntry[])
      .filter((e) => typeof e?.path === "string" && existsSync(e.path))
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return [];
  }
}

/**
 * In the home index, an item id is namespaced by project so ids from different
 * ledgers never collide — and so a home hit is never mistaken for a spliceable
 * local ledger id by `ui memory context --rank-file`.
 */
export function namespacedId(project: string, id: string): string {
  return `p:${project}:${id}`;
}

/** The meta cursor for one project inside the home index. */
export function cursorKey(project: string): string {
  return `lastIndexedId:${project}`;
}
