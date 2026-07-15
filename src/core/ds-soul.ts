/**
 * Design Soul — the DECLARED-stance kernel (see knowledge/design-soul.md).
 * `design/soul.md` states what a project's design language never does, always
 * does, and how its copy sounds — precedence: brief > soul > memory prior >
 * knowledge floors. Pure, fs-free: the scaffold text (emitter) + a STRUCTURE
 * linter (never taste — taste is a model judgment). Fs I/O lives in the
 * command layer (ds-init-impl.ts, ds-soul-impl.ts).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkLoremIpsum, checkPlaceholderName } from "./content-checks.js";
import { lineAt } from "./a11y-lint.js";

export const SOUL_FILENAME = "soul.md";

/** Emitter side of the standard — the scaffold `ds init` / `ds soul init` writes. */
export const SOUL_SCAFFOLD = `---
status: draft
---

# Design Soul — <project>

_Declared stance. Every /ui:* flow reads this BEFORE picking personas or tokens.
Precedence: brief > soul (project > studio > factory) > memory prior > knowledge floors. Short beats long._

## Never

- <!-- what this system NEVER does — e.g. "rounded corners", "purple gradients" -->

## Always

- <!-- what this system ALWAYS holds — e.g. "oversized display type", "real photography, never stock" -->

## Voice

- <!-- how the copy speaks — e.g. "plain-spoken, Vietnamese-first, zero filler" -->

<!-- When done editing: change status: draft → status: ratified. \`ui ds soul check\`
     keeps warning while the file is a draft or these placeholder comments remain. -->
`;

// ─── Types ────────────────────────────────────────────────────────────────────
export type SoulSeverity = "error" | "warning";
export interface SoulFinding { checkId: string; severity: SoulSeverity; message: string; line?: number; }
export interface SoulCheckResult { findings: SoulFinding[]; errorCount: number; warningCount: number; }

// ─── Emitter ──────────────────────────────────────────────────────────────────

/**
 * Write the soul scaffold into `<designDir>/soul.md`.
 * Never overwrites an existing file unless `force` is true — a project's
 * declared stance, once edited, must never be silently clobbered by a re-init.
 */
export function writeSoulScaffold(designDir: string, force = false): { path: string; written: boolean } {
  const path = join(designDir, SOUL_FILENAME);
  if (existsSync(path) && !force) return { path, written: false };
  mkdirSync(designDir, { recursive: true });
  writeFileSync(path, SOUL_SCAFFOLD, "utf8");
  return { path, written: true };
}

// ─── Context formatting ───────────────────────────────────────────────────────

const CONTEXT_LINE_CAP = 150;

/**
 * Prepare soul.md's raw text for `ui ds context`'s "soul" section: trim outer
 * whitespace and cap at 150 lines (short beats long — a soul is a declared
 * stance, not a spec; if it needs 150+ lines it has stopped being one).
 */
export function soulSectionForContext(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  if (lines.length <= CONTEXT_LINE_CAP) return trimmed;
  return (
    lines.slice(0, CONTEXT_LINE_CAP).join("\n") +
    `\n\n…(soul.md truncated to ${CONTEXT_LINE_CAP} lines for context — read the file directly for the rest)`
  );
}

// ─── Linter (checkSoul) helpers ────────────────────────────────────────────────

const REQUIRED_SECTIONS = ["Never", "Always", "Voice"] as const;
type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

/** Locate a `## <Name>` section's body — text between its heading and the next `## ` heading, or EOF. */
function sectionBody(text: string, name: RequiredSection): { body: string; line: number } | null {
  const headingRe = new RegExp(`^##[ \\t]+${name}[ \\t]*$`, "m");
  const m = headingRe.exec(text);
  if (m === null) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^##[ \t]+\S/m.exec(rest);
  const body = next !== null ? rest.slice(0, next.index) : rest;
  return { body, line: lineAt(text, m.index) };
}

/** A section "has content" when ≥1 bullet's text is real — not blank, not an HTML-comment placeholder. */
function hasRealBullet(body: string): boolean {
  const bulletRe = /^[ \t]*[-*][ \t]+(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = bulletRe.exec(body)) !== null) {
    const content = (m[1] ?? "").trim();
    if (content !== "" && !content.startsWith("<!--")) return true;
  }
  return false;
}

/** Derive a scaffold's placeholder HTML comments from its own text (emitter and
 * linter never drift — the check set IS the scaffold's comments). Exported so
 * scaffold variants (the studio soul, ds-soul-studio.ts) derive their own set. */
export function derivePlaceholderComments(scaffold: string): readonly string[] {
  return [...scaffold.matchAll(/<!--[\s\S]*?-->/g)].map((m) => m[0]);
}

/** The scaffold's own HTML-comment placeholders, derived from SOUL_SCAFFOLD so the two never drift apart. */
const SCAFFOLD_PLACEHOLDERS: readonly string[] = derivePlaceholderComments(SOUL_SCAFFOLD);

/** The `status:` value from the `---`-delimited frontmatter block, or null when absent (block or key). */
function frontmatterStatus(text: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (fm === null) return null;
  const m = /^status:[ \t]*(\S+)/m.exec(fm[1] ?? "");
  return m?.[1] ?? null;
}

// ─── Linter (checkSoul) ────────────────────────────────────────────────────────

/**
 * Lint a soul.md's STRUCTURE only — never its content taste. Pure function of
 * the file's text; the command layer decides what to do when the file is
 * missing entirely (that is not this function's concern — see ds-soul-impl.ts).
 * `placeholderComments`: the scaffold-untouched match set (scaffold variants pass their own derived set).
 */
export function checkSoul(text: string, placeholderComments: readonly string[] = SCAFFOLD_PLACEHOLDERS): SoulCheckResult {
  const findings: SoulFinding[] = [];

  for (const name of REQUIRED_SECTIONS) {
    const section = sectionBody(text, name);
    if (section === null) {
      findings.push({
        checkId: "soul-missing-section",
        severity: "error",
        message: `missing required heading '## ${name}'`,
      });
      continue;
    }
    if (!hasRealBullet(section.body)) {
      findings.push({
        checkId: "soul-empty-section",
        severity: "error",
        message: `section '## ${name}' has no real content — only blank or placeholder-comment bullets`,
        line: section.line,
      });
    }
  }

  const status = frontmatterStatus(text);
  if (status !== "ratified") {
    findings.push({
      checkId: "soul-draft-status",
      severity: "warning",
      message:
        status === null
          ? "no 'status:' in frontmatter (or no frontmatter at all) — defaults to draft"
          : `frontmatter status is '${status}' — set 'status: ratified' once reviewed`,
    });
  }

  if (placeholderComments.some((p) => text.includes(p))) {
    findings.push({
      checkId: "soul-scaffold-untouched",
      severity: "warning",
      message: "scaffold placeholder HTML comment(s) still present — replace them with real content",
    });
  }

  const lineCount = text.split("\n").length;
  if (lineCount > 120) {
    findings.push({
      checkId: "soul-too-long",
      severity: "warning",
      message: `soul.md is ${lineCount} lines (> 120) — short beats long; trim to the essentials`,
    });
  }

  for (const f of [...checkLoremIpsum(text), ...checkPlaceholderName(text)]) {
    findings.push({ checkId: "soul-placeholder-copy", severity: "error", message: f.message, line: f.line });
  }

  findings.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.checkId.localeCompare(b.checkId),
  );
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { findings, errorCount, warningCount: findings.length - errorCount };
}
