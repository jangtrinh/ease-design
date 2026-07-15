/**
 * Studio Soul — the genealogy layer ABOVE every project soul (see
 * knowledge/design-soul.md §6). Where `design/soul.md` declares one project's
 * stance, `$EASE_DESIGN_HOME/studio-soul.md` declares what stays true across
 * ALL of a studio's products; a project's soul inherits it and overrides it on
 * conflict. Split out of ds-soul.ts so both files stay under the 200-line
 * guideline.
 *
 * Same shape as ds-soul.ts: emitter (scaffold + write) + linter (reuses the
 * P1 `checkSoul` against the STUDIO scaffold's own placeholder set, plus the
 * one thing a studio soul adds — a `name:` frontmatter value later genealogy
 * tooling uses to name a studio's agents, e.g. `name: JANG` → agent
 * `jang-<project>`) + the 150-line context cap.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkSoul, derivePlaceholderComments, soulSectionForContext } from "./ds-soul.js";
import type { SoulCheckResult, SoulFinding } from "./ds-soul.js";

export const STUDIO_SOUL_FILENAME = "studio-soul.md";

/** Emitter side of the standard — the scaffold `ds soul init --studio` writes. */
export const STUDIO_SOUL_SCAFFOLD = `---
status: draft
name: <studio>
---

# Design Soul — studio

_The layer ABOVE every project soul: what stays true across ALL your products.
A project's design/soul.md inherits this and overrides on conflict.
\`name:\` above names your agents (e.g. name: JANG → agent jang-<project>).
Below both sits the factory baseline design:os ships ('ui ds soul factory')._

## Never

- <!-- what the studio NEVER does, regardless of project -->

## Always

- <!-- what every product of this studio ALWAYS holds -->

## Voice

- <!-- the studio-wide voice -->
`;

/**
 * Write the studio scaffold into `<homeDir>/studio-soul.md` — mirrors
 * writeSoulScaffold's never-overwrite-without-force semantics, scoped to the
 * user's studio home (`$EASE_DESIGN_HOME`) instead of a project's design/ dir.
 */
export function writeStudioSoulScaffold(homeDir: string, force = false): { path: string; written: boolean } {
  const path = join(homeDir, STUDIO_SOUL_FILENAME);
  if (existsSync(path) && !force) return { path, written: false };
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(path, STUDIO_SOUL_SCAFFOLD, "utf8");
  return { path, written: true };
}

// ─── name: frontmatter ────────────────────────────────────────────────────────

/**
 * Parse the frontmatter `name:` value from a studio soul (e.g. "JANG") — the
 * name later genealogy tooling bakes into a studio's generated agents. Null
 * when there is no frontmatter block, no `name:` key, an empty value, or the
 * untouched scaffold placeholder `<studio>`.
 */
export function soulName(text: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (fm === null) return null;
  const m = /^name:[ \t]*(.*)$/m.exec(fm[1] ?? "");
  if (m === null) return null;
  const value = (m[1] ?? "").trim();
  return value === "" || value === "<studio>" ? null : value;
}

// ─── Linter (checkStudioSoul) ─────────────────────────────────────────────────

/** The studio scaffold's own placeholder comments — derived from
 * STUDIO_SOUL_SCAFFOLD (same derivation as the project set) so the two never drift. */
const STUDIO_SCAFFOLD_PLACEHOLDERS: readonly string[] = derivePlaceholderComments(STUDIO_SOUL_SCAFFOLD);

const MISSING_NAME_FINDING: SoulFinding = {
  checkId: "soul-missing-name",
  severity: "error",
  message: "studio soul needs frontmatter `name:` — it names your agents (e.g. name: JANG)",
};

/** Same finding sort as checkSoul's, re-applied after inserting the studio-only finding. */
function sortFindings(findings: readonly SoulFinding[]): SoulFinding[] {
  return [...findings].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.checkId.localeCompare(b.checkId),
  );
}

/**
 * `checkSoul` with the STUDIO scaffold's placeholder set, plus one studio-only
 * finding: `soul-missing-name` when `soulName(text)` is null. The 6 P1
 * structure checks are otherwise reused as-is — `soul-scaffold-untouched` now
 * fires on THIS scaffold's leftover comments too, closing the paired-standard
 * hole; a studio soul is a soul, just one frontmatter field richer.
 */
export function checkStudioSoul(text: string): SoulCheckResult {
  const base = checkSoul(text, STUDIO_SCAFFOLD_PLACEHOLDERS);
  if (soulName(text) !== null) return base;

  const findings = sortFindings([...base.findings, MISSING_NAME_FINDING]);
  return {
    findings,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

// ─── Context formatting ───────────────────────────────────────────────────────

/**
 * Prepare studio-soul.md's raw text for `ui ds context`'s studio section —
 * reuses the project soul's trim + 150-line cap (soulSectionForContext)
 * verbatim: a studio soul is the same kind of declared-stance artifact, just
 * scoped one level up the genealogy.
 */
export function studioSoulSectionForContext(text: string): string {
  return soulSectionForContext(text);
}
