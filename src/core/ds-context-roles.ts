/**
 * Roles section for `ds context` (spec 011 Phase 2).
 *
 * Reads the BAKED `$extensions["design-os.role"]` annotation already written by
 * `ds import` (role-recognition.ts) or corrected by `ds set-role` — NEVER
 * recomputes recognition here. Re-running `recognizeRoles` in this module would
 * silently discard an owner's manual `ds set-role` correction; reading the
 * stored annotation is what makes that correction stick.
 *
 * Kept out of ds-context.ts (already near/at the 200-line guideline) as its own
 * small, pure module — one responsibility, one file.
 */
import { CANONICAL_ROLES } from "./role-recognition.js";
import type { Role } from "./role-recognition.js";
import type { TokenTree } from "./token-model.js";

export interface RolesSummary {
  /** Every canonical role with ≥1 token carrying it, sorted by role name; each entry's paths sorted. */
  roles: { role: Role; paths: string[] }[];
  /** Canonical roles with zero tokens carrying them. */
  gaps: Role[];
}

/**
 * Scan every token's baked role annotation. Returns `null` when NO token in the
 * tree carries one — a DS imported before this feature shipped, or hand-built
 * with no bake step. Both context sections are then omitted entirely (never an
 * error, never a guessed section for a DS that never opted in).
 */
export function summarizeRoles(tokens: TokenTree): RolesSummary | null {
  const byRole = new Map<Role, string[]>();
  for (const [category, group] of Object.entries(tokens)) {
    for (const [name, token] of Object.entries(group)) {
      const role = (token.$extensions as Record<string, unknown> | undefined)?.["design-os.role"];
      if (typeof role !== "string" || !(CANONICAL_ROLES as readonly string[]).includes(role)) continue;
      const paths = byRole.get(role as Role);
      const path = `${category}.${name}`;
      if (paths !== undefined) paths.push(path);
      else byRole.set(role as Role, [path]);
    }
  }
  if (byRole.size === 0) return null;

  const roles = [...byRole.entries()]
    .map(([role, paths]) => ({ role, paths: [...paths].sort() }))
    .sort((a, b) => a.role.localeCompare(b.role));
  const gaps = CANONICAL_ROLES.filter((r) => !byRole.has(r));
  return { roles, gaps };
}

/**
 * Render the '## Roles' + '## Missing roles' markdown lines. Empty array when
 * `summary` is null (nothing to say — omit both sections, not an error).
 */
export function rolesMarkdownLines(summary: RolesSummary | null): string[] {
  if (summary === null) return [];
  const lines: string[] = ["## Roles", ""];
  for (const { role, paths } of summary.roles) {
    lines.push(`- ${role} → ${paths.join(", ")}`);
  }
  lines.push("", "## Missing roles", "");
  lines.push(
    summary.gaps.length === 0
      ? "(none — every canonical role has a recognized token)"
      : `${summary.gaps.join(", ")} (no token — add via 'ui ds change-token' in your own name)`,
  );
  lines.push("");
  return lines;
}
