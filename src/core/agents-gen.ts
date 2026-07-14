/**
 * Agent generation kernel — the pure half of `ui agents` (see
 * knowledge/design-agents.md). An agent is a soul-bound, task-scoped identity
 * generated into the host runtime's subagent format (Claude Code:
 * `.claude/agents/<name>.md`). Identity is RUNTIME-READ, never baked: the
 * generated body only instructs the agent to run `ui ds context` first, so a
 * soul edit propagates with zero drift. Only the NAME is baked at generate
 * time (genealogy naming below) — rename → regenerate.
 *
 * Emitter + linter pair: templates/agents/<role>.md is the source of truth;
 * every generated file carries a stamp comment with an fnv1a hash of its
 * template, and `ui agents check` compares stamps against the live templates
 * (the adapter-freshness pattern). Pure, fs-free; I/O lives in the command
 * layer (src/commands/agents.ts).
 */

// ─── Roster ───────────────────────────────────────────────────────────────────

/** The three launch roles. Registry grows only after these live in the wild. */
export const ROSTER = ["designer", "curator", "figma-hand"] as const;
export type AgentRole = (typeof ROSTER)[number];

// ─── Naming (genealogy) ───────────────────────────────────────────────────────

/**
 * Force a candidate into Claude Code's subagent-name shape
 * `^[a-z][a-z0-9-]*$`, max 64: lowercase, every other char → "-", collapse
 * runs, trim edge hyphens, drop leading non-letters, cap at 64 (re-trimming a
 * hyphen the cap may expose). May return "" when nothing survives (e.g. a
 * studio name with no ASCII letters) — callers fall back accordingly.
 */
export function sanitizeAgentName(raw: string): string {
  let s = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  s = s.replace(/-{2,}/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  s = s.replace(/^[^a-z]+/, "");
  s = s.slice(0, 64).replace(/-+$/, "");
  return s;
}

/**
 * Genealogy naming (studio × project × role):
 *   with a studio soul (`name: JANG`, project `vsf-pcp`):
 *     designer   → jang-vsf-pcp          (the flagship carries the bare name)
 *     curator    → jang-vsf-pcp-curator
 *     figma-hand → jang-vsf-pcp-figma
 *   without a studio soul:
 *     designer   → vsf-pcp-designer      (+ the command layer hints at
 *     curator    → vsf-pcp-curator        creating a studio soul)
 *     figma-hand → vsf-pcp-figma
 * The assembled name is sanitized as a whole (see sanitizeAgentName).
 */
export function agentName(
  role: AgentRole,
  projectName: string,
  studioName: string | null,
): string {
  const base = studioName !== null ? `${studioName}-${projectName}` : projectName;
  const named =
    role === "designer"
      ? studioName !== null
        ? base
        : `${base}-designer`
      : role === "curator"
        ? `${base}-curator`
        : `${base}-figma`;
  return sanitizeAgentName(named);
}

// ─── Template hash (fnv1a → 8 hex chars) ──────────────────────────────────────

/**
 * FNV-1a 32-bit over the template text's UTF-16 code units, as 8 lowercase hex
 * chars. Hashes the RAW template (placeholders included, `{{HASH}}` itself
 * literal), so the stamp in a generated file identifies exactly which template
 * revision produced it; `ui agents check` recomputes this over the live
 * template and flags a mismatch as `agent-stale`.
 */
export function templateHash(tpl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < tpl.length; i++) {
    h ^= tpl.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ─── Render ───────────────────────────────────────────────────────────────────

export interface AgentVars {
  /** The computed agent name (from agentName) — the only baked identity. */
  name: string;
  /** Project name from design/ds.manifest.json. */
  project: string;
  /** Studio name from the studio soul's `name:` frontmatter, or null. */
  studio: string | null;
}

/**
 * Substitute a template's placeholders. {{STUDIO_LINE}} becomes a one-sentence
 * genealogy note (leading space — it follows a period in the templates) when a
 * studio name exists, else the empty string. {{HASH}} becomes
 * templateHash(tpl) so the emitted stamp always matches its source template.
 */
export function renderAgent(tpl: string, vars: AgentVars): string {
  const studioLine =
    vars.studio !== null
      ? ` You carry the ${vars.studio} studio's soul as your base identity.`
      : "";
  return tpl
    .replaceAll("{{NAME}}", vars.name)
    .replaceAll("{{PROJECT}}", vars.project)
    .replaceAll("{{STUDIO_LINE}}", studioLine)
    .replaceAll("{{HASH}}", templateHash(tpl));
}

// ─── Stamp parsing (the linter's read side) ───────────────────────────────────

const STAMP_RE =
  /<!--\s*design-os agents\s*·\s*roster-role:\s*([a-z][a-z0-9-]*)\s*·\s*template-hash:\s*([0-9a-f]{8})\s*-->/;

export interface AgentStamp {
  /** Role recorded at generate time (may no longer be in ROSTER). */
  role: string;
  /** templateHash of the template that generated the file. */
  hash: string;
}

/**
 * Extract the design-os stamp from a generated agent file, or null when the
 * file carries none (a hand-written or foreign `.claude/agents/*.md` — those
 * are never ours to lint). A template file itself also returns null: its
 * `{{HASH}}` placeholder is not 8 hex chars.
 */
export function parseAgentStamp(fileText: string): AgentStamp | null {
  const m = STAMP_RE.exec(fileText);
  if (m === null) return null;
  return { role: m[1] as string, hash: m[2] as string };
}
