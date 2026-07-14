/**
 * `ui agents` — generate + lint soul-bound, task-scoped project agents
 * (Claude Code subagents under `.claude/agents/`). Pure kernel:
 * src/core/agents-gen.ts; knowledge: knowledge/design-agents.md.
 *
 * Opt-in by design — `ui init` never generates agents, it only hints. The
 * emitter/linter pair: `init` renders templates/agents/<role>.md with the
 * genealogy name (studio soul `name:` × manifest name × role) and a stamp;
 * `check` re-renders the live templates and flags any file whose content no
 * longer matches (template drift, hand edits, or a renamed studio/project).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { errJson, errText, ok, okJson, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { discoverDesignSystem, pathsForDir } from "../core/design-system.js";
import { loadManifest, DSManifestError } from "../core/ds-manifest.js";
import { easeHome } from "../core/memory-store.js";
import { STUDIO_SOUL_FILENAME, soulName } from "../core/ds-soul-studio.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { ROSTER, agentName, parseAgentStamp, renderAgent, templateHash } from "../core/agents-gen.js";
import type { AgentRole, AgentStamp } from "../core/agents-gen.js";

const CMD = "agents";

export const AGENTS_HELP = `ui agents — soul-bound, task-scoped project agents (Claude Code subagents)

Usage:
  ui agents init  [--dir <project>] [--roster designer,curator,figma-hand] [--force] [--json]
  ui agents list  [--dir <project>] [--json]
  ui agents check [--dir <project>] [--json]

Subcommands:
  init    Generate one .claude/agents/<name>.md per roster role (opt-in; 'ui init' never runs this)
  list    Scan .claude/agents/*.md for design-os stamps → role / name / hash / fresh
  check   Findings-linter over the generated agents; exit 1 on error-severity findings

Naming (genealogy — studio × project × role):
  With a studio soul ($EASE_DESIGN_HOME/studio-soul.md, frontmatter name: JANG)
  and project 'vsf-pcp' (design/ds.manifest.json name):
    designer   → jang-vsf-pcp            (the flagship carries the bare name)
    curator    → jang-vsf-pcp-curator
    figma-hand → jang-vsf-pcp-figma
  Without a studio soul: vsf-pcp-designer / vsf-pcp-curator / vsf-pcp-figma
  (and init hints at 'ui ds soul init --studio'). Names are sanitized to
  ^[a-z][a-z0-9-]*$, capped at 64 chars.

Identity is RUNTIME-READ, never baked: a generated agent's first action is
'ui ds context' (which carries the project soul + the studio soul), so soul
edits propagate with zero drift. Only the NAME is baked at generate time —
rename the studio or project → 'ui agents init --force'.

'init' options:
  --dir <path>    Project directory holding design/ (default: walk up from cwd)
  --roster <csv>  Roles to generate, from: designer, curator, figma-hand (default: all 3)
  --force         Overwrite existing agent files (without it, existing files → EXISTS)

'list' / 'check' options:
  --dir <path>    Project directory (default: the discovered DS project, else cwd)

'check' findings:
  agent-stale         (error)   file no longer matches its template render — the
                                template changed, the file was hand-edited, or the
                                studio/project name moved; fix: 'ui agents init --force'
  agent-unknown-role  (warning) a stamped file's roster-role is not in the roster
  no-agents           (warning) no stamped agents found — agents are opt-in, never required

Runtime scope: Claude Code only for now (.claude/agents/). codex / antigravity
subagent formats are tracked in knowledge/design-agents.md; nothing is emitted
for them yet.

Common options:
  --json        Emit a JSON envelope
  -h, --help    Show this help

Error codes:
  DS_NOT_FOUND  No design/ds.manifest.json — agents bind to a project design
                system; run 'ui ds init <name>' (or /ui:learn) first
  BAD_ARG       Missing/unknown subcommand, or a bad --roster role
  EXISTS        'init' target agent file already exists (use --force to overwrite)
  BAD_MANIFEST  design/ds.manifest.json is malformed
  READ_ERROR    A template or agent file could not be read
  WRITE_ERROR   An agent file could not be written
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
`;

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Fail = { fail: true; code: string; message: string };
const fail = (code: string, message: string): Fail => ({ fail: true, code, message });
const isFail = (v: unknown): v is Fail =>
  typeof v === "object" && v !== null && (v as { fail?: unknown }).fail === true;

const DS_HINT =
  "no design/ds.manifest.json found — agents bind to a project design system; run 'ui ds init <name>' (or /ui:learn) first.";

/** Project root + manifest name, from --dir or upward discovery. */
function loadProject(dirFlag: string | boolean | undefined): { root: string; project: string } | Fail {
  let designDir: string;
  if (typeof dirFlag === "string") designDir = pathsForDir(resolve(dirFlag, "design")).dir;
  else {
    try { designDir = discoverDesignSystem(undefined).dir; }
    catch { return fail("DS_NOT_FOUND", DS_HINT); }
  }
  try {
    const manifest = loadManifest(join(designDir, "ds.manifest.json"));
    return { root: dirname(designDir), project: manifest.name };
  } catch (e) {
    if (e instanceof DSManifestError && e.code === "MANIFEST_NOT_FOUND") return fail("DS_NOT_FOUND", DS_HINT);
    const code = e instanceof DSManifestError ? e.code : "READ_ERROR";
    return fail(code, e instanceof Error ? e.message : String(e));
  }
}

/** Project root for read-only scans — --dir, else the discovered DS project, else cwd. */
function resolveRoot(dirFlag: string | boolean | undefined): string {
  if (typeof dirFlag === "string") return resolve(dirFlag);
  try { return dirname(discoverDesignSystem(undefined).dir); }
  catch { return process.cwd(); }
}

const agentsDirFor = (root: string): string => join(root, ".claude", "agents");

/** Studio name from $EASE_DESIGN_HOME/studio-soul.md, or null (absence degrades silently). */
function studioNameFromHome(): string | null {
  const p = join(easeHome(), STUDIO_SOUL_FILENAME);
  try { return existsSync(p) ? soulName(readFileSync(p, "utf8")) : null; }
  catch { return null; }
}

/** Read all three role templates from the package's templates/agents/. */
function agentTemplates(): Record<AgentRole, string> | Fail {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const { templatesRoot } = resolvePackageRoots(startDir);
  if (templatesRoot === null) return fail("READ_ERROR", `ease-design templates not found (searched upward from ${startDir})`);
  const out = {} as Record<AgentRole, string>;
  for (const role of ROSTER) {
    const p = join(templatesRoot, "agents", `${role}.md`);
    try { out[role] = readFileSync(p, "utf8"); }
    catch (e) { return fail("READ_ERROR", `cannot read agent template '${p}': ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
}

interface ScannedAgent { name: string; path: string; text: string; stamp: AgentStamp }

/** All stamped design-os agent files under agentsDir, name-sorted. Unstamped files are never ours to lint. */
function scanStampedAgents(agentsDir: string): ScannedAgent[] | Fail {
  if (!existsSync(agentsDir)) return [];
  let files: string[];
  try { files = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort(); }
  catch (e) { return fail("READ_ERROR", `cannot read '${agentsDir}': ${e instanceof Error ? e.message : String(e)}`); }
  const out: ScannedAgent[] = [];
  for (const f of files) {
    const p = join(agentsDir, f);
    let text: string;
    try { text = readFileSync(p, "utf8"); }
    catch (e) { return fail("READ_ERROR", `cannot read '${p}': ${e instanceof Error ? e.message : String(e)}`); }
    const stamp = parseAgentStamp(text);
    if (stamp !== null) out.push({ name: f.replace(/\.md$/, ""), path: p, text, stamp });
  }
  return out;
}

/** The exact content `init` would write for a role right now — the check/list freshness baseline. */
function expectedRender(role: AgentRole, tpls: Record<AgentRole, string>, project: string, studio: string | null): string {
  return renderAgent(tpls[role], { name: agentName(role, project, studio), project, studio });
}

const isRosterRole = (r: string): r is AgentRole => (ROSTER as readonly string[]).includes(r);

// ─── init ─────────────────────────────────────────────────────────────────────

function runInit(parsed: ParsedArgs): CommandResult {
  const sub = "agents init";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir", "roster", "force"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const proj = loadProject(parsed.flags["dir"]);
  if (isFail(proj)) return err(proj.code, proj.message);
  const tpls = agentTemplates();
  if (isFail(tpls)) return err(tpls.code, tpls.message);
  const studio = studioNameFromHome();

  // Roster: default all three; csv subset otherwise (canonical ROSTER order).
  let roles: AgentRole[] = [...ROSTER];
  const rosterFlag = parsed.flags["roster"];
  if (rosterFlag === true) return err("BAD_ARG", `--roster requires a value — roles: ${ROSTER.join(", ")}`);
  if (typeof rosterFlag === "string") {
    const requested = rosterFlag.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (requested.length === 0) return err("BAD_ARG", `--roster is empty — roles: ${ROSTER.join(", ")}`);
    for (const r of requested) {
      if (!isRosterRole(r)) return err("BAD_ARG", `unknown roster role '${r}' — roles: ${ROSTER.join(", ")}`);
    }
    const set = new Set(requested);
    roles = ROSTER.filter((r) => set.has(r));
  }

  const dir = agentsDirFor(proj.root);
  const plan = roles.map((role) => {
    const name = agentName(role, proj.project, studio);
    return { role, name, path: join(dir, `${name}.md`), content: expectedRender(role, tpls, proj.project, studio) };
  });

  // EXISTS pre-flight — all-or-nothing, never a silent overwrite.
  if (parsed.flags["force"] !== true) {
    const existing = plan.filter((p) => existsSync(p.path)).map((p) => `'${p.path}'`);
    if (existing.length > 0) {
      return err("EXISTS", `agent file(s) already exist — re-run with --force to overwrite: ${existing.join(", ")}`);
    }
  }

  const written: string[] = [];
  try {
    mkdirSync(dir, { recursive: true });
    for (const p of plan) {
      writeFileSync(p.path, p.content, "utf8");
      written.push(p.path);
    }
  } catch (e) {
    for (const w of written) { try { unlinkSync(w); } catch { /* best-effort rollback */ } }
    return err("WRITE_ERROR", `cannot write agent files: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (useJson) {
    return okJson(sub, { agents: plan.map(({ role, name, path }) => ({ role, name, path, written: true })) });
  }
  const lines = plan.map((p) => `agent written: ${p.path} (${p.role})`);
  if (studio === null) {
    lines.push("hint: no studio soul — 'ui ds soul init --studio' gives your agents a studio genealogy (name: JANG → jang-<project>)");
  }
  lines.push("agents are Claude Code subagents — delegate with their names.");
  return ok(lines.join("\n") + "\n");
}

// ─── list ─────────────────────────────────────────────────────────────────────

function runList(parsed: ParsedArgs): CommandResult {
  const sub = "agents list";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const agentsDir = agentsDirFor(resolveRoot(parsed.flags["dir"]));
  const agents = scanStampedAgents(agentsDir);
  if (isFail(agents)) return err(agents.code, agents.message);

  if (agents.length === 0) {
    if (useJson) return okJson(sub, { dir: agentsDir, agents: [] });
    return ok(`agents list: no design-os agents in ${agentsDir} — run 'ui agents init'.\n`);
  }

  const proj = loadProject(parsed.flags["dir"]);
  if (isFail(proj)) return err(proj.code, proj.message);
  const tpls = agentTemplates();
  if (isFail(tpls)) return err(tpls.code, tpls.message);
  const studio = studioNameFromHome();

  const rows = agents.map((a) => ({
    name: a.name,
    role: a.stamp.role,
    hash: a.stamp.hash,
    fresh: isRosterRole(a.stamp.role) && templateHash(a.text) === templateHash(expectedRender(a.stamp.role, tpls, proj.project, studio)),
    path: a.path,
  }));

  if (useJson) return okJson(sub, { dir: agentsDir, agents: rows });
  const lines = [
    `agents list: ${rows.length} design-os agent(s) in ${agentsDir}`,
    ...rows.map((r) => `  ${r.name.padEnd(32)} ${r.role.padEnd(12)} ${r.hash}  ${r.fresh ? "fresh" : "stale"}`),
  ];
  return ok(lines.join("\n") + "\n");
}

// ─── check ────────────────────────────────────────────────────────────────────

interface AgentFinding { checkId: string; severity: "error" | "warning"; message: string }

function runCheck(parsed: ParsedArgs): CommandResult {
  const sub = "agents check";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const agentsDir = agentsDirFor(resolveRoot(parsed.flags["dir"]));
  const agents = scanStampedAgents(agentsDir);
  if (isFail(agents)) return err(agents.code, agents.message);

  const findings: AgentFinding[] = [];
  if (agents.length === 0) {
    findings.push({
      checkId: "no-agents",
      severity: "warning",
      message: `no design-os agents under '${agentsDir}' — agents are opt-in; run 'ui agents init' to create them`,
    });
  } else {
    const proj = loadProject(parsed.flags["dir"]);
    if (isFail(proj)) return err(proj.code, proj.message);
    const tpls = agentTemplates();
    if (isFail(tpls)) return err(tpls.code, tpls.message);
    const studio = studioNameFromHome();
    for (const a of agents) {
      if (!isRosterRole(a.stamp.role)) {
        findings.push({
          checkId: "agent-unknown-role",
          severity: "warning",
          message: `'${a.name}.md' carries roster-role '${a.stamp.role}', which is not in the roster (${ROSTER.join(", ")})`,
        });
      } else if (templateHash(a.text) !== templateHash(expectedRender(a.stamp.role, tpls, proj.project, studio))) {
        findings.push({
          checkId: "agent-stale",
          severity: "error",
          message: `'${a.name}' (${a.stamp.role}) is stale — the file no longer matches its template render; run 'ui agents init --force' to regenerate`,
        });
      }
    }
  }

  findings.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.checkId.localeCompare(b.checkId) ||
      a.message.localeCompare(b.message),
  );
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;

  if (useJson) return okJsonWithExit(sub, { dir: agentsDir, findings, errorCount, warningCount }, exitCode);
  const lines =
    findings.length === 0
      ? [`agents check: ${agentsDir} — 0 findings.`]
      : [
          `agents check: ${agentsDir} — ${errorCount} error(s), ${warningCount} warning(s)`,
          ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`),
        ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export const agentsCommand = {
  name: CMD,
  summary: "Generate + lint soul-bound, task-scoped project agents (Claude Code)",
  hasSubcommands: true,
  help: AGENTS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "init":  return runInit(parsed);
      case "list":  return runList(parsed);
      case "check": return runCheck(parsed);
      case undefined: {
        const msg = "ui agents requires a subcommand (init/list/check). Run 'ui agents --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui agents --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
