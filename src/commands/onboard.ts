/**
 * `ui onboard` command — this project's setup readiness checklist.
 *
 * The third leg of the doctor/onboard/guide triad (see
 * specs/019-onboarding-first-run/overview.md): `ui doctor` asks "is the tool
 * healthy?", `ui onboard` asks "is THIS project set up, and what's next?",
 * `ui guide` asks "what can I do?". Deterministic and read-only — it never
 * mutates the filesystem and never installs anything; it only reports what
 * is missing and the exact command to fix it. Always exits 0 (informational,
 * like `design-os evolution`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env, cwd as processCwd } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { okJson } from "../core/output.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { RUNTIME_REGISTRY } from "../core/runtime-registry.js";
import { renderBanner, ruleHeader, checkItem } from "../core/report-style.js";

const CMD = "onboard";

export const ONBOARD_HELP = `ui onboard — this project's setup checklist and what to do next

Usage:
  ui onboard [--cwd <project-dir>] [--no-banner] [--json]

Options:
  --cwd <path>  Project directory to inspect (default: current working directory)
  --no-banner   Omit the wordmark banner from text output
  --json        Emit a JSON envelope instead of human-readable output
  -h, --help    Show this help

Reads the filesystem only; never writes, never installs. Reports which setup
steps are done, which are missing, and the exact command to fix each one.

Exit codes:
  0  Always (informational — read \`ready\` in --json mode, or the header verdict)
`;

// ─── Step model ─────────────────────────────────────────────────────────────

type StepState = "done" | "pending" | "warn";
interface Step {
  id: string;
  label: string;
  state: StepState;
  optional: boolean;
  hint: string;
}

const HINTS = {
  adapters: "run `ui init` to install the runtime adapters",
  git: "run `git init` — DESIGN:OS needs version control",
  ds: "run `ui ds init` (new) or `ui ds import` (existing) to set up the design system",
  soul: "run `ui ds soul` to declare your design stance",
  heartbeat: "wired automatically by `ui ds init`/`ui ds import`",
  agents: "run `ui agents init` for soul-bound project agents (Claude Code)",
  figma: "open the Figma Design Agent plugin, then `figma-agent status`",
} as const;

/** `design/soul.md`'s frontmatter `status:` value, or null if unreadable/absent.
 * Never throws — a soul path that is a directory or unreadable must not crash the
 * always-exit-0 command. */
function readSoulStatus(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm === null) return null;
    const sm = (fm[1] ?? "").match(/^status:\s*(\S+)/m);
    return sm?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Any `.claude/agents/*.md` file present. */
function hasAgentFiles(cwd: string): boolean {
  const dir = join(cwd, ".claude", "agents");
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

/**
 * A configured Figma reference: the `FIGMA_AGENT_FILE` env pin — the signal the
 * figma-agent itself uses. (The current DSManifest schema carries no figma field,
 * so there is nothing reliable to read from disk; a raw-text scan would
 * false-positive on any manifest that merely mentions "figma".)
 */
function hasFigmaRef(): boolean {
  return (env["FIGMA_AGENT_FILE"] ?? "").length > 0;
}

function detectSteps(cwd: string): Step[] {
  const hasAdapters = RUNTIME_REGISTRY.filter((r) => r.native).some((r) =>
    existsSync(r.manifestPath(cwd)),
  );
  const hasGit = existsSync(join(cwd, ".git"));
  const hasDs = existsSync(join(cwd, "design", "ds.manifest.json"));
  const soulStatus = readSoulStatus(join(cwd, "design", "soul.md"));
  const hasHeartbeat = existsSync(join(cwd, "design", "heartbeat.json"));
  const hasAgents = hasAgentFiles(cwd);
  const hasFigma = hasFigmaRef();

  const soulState: StepState = soulStatus === null ? "pending" : soulStatus === "ratified" ? "done" : "warn";

  return [
    { id: "adapters", label: "runtime adapters installed", state: hasAdapters ? "done" : "pending", optional: false, hint: HINTS.adapters },
    { id: "git", label: "git initialized", state: hasGit ? "done" : "pending", optional: false, hint: HINTS.git },
    { id: "ds", label: "design system", state: hasDs ? "done" : "pending", optional: false, hint: HINTS.ds },
    { id: "soul", label: "design soul", state: soulState, optional: false, hint: HINTS.soul },
    { id: "heartbeat", label: "learning loop (soul · heartbeat · harvest)", state: hasHeartbeat ? "done" : "pending", optional: false, hint: HINTS.heartbeat },
    { id: "agents", label: "project agents      (optional)", state: hasAgents ? "done" : "pending", optional: true, hint: HINTS.agents },
    { id: "figma", label: "figma design agent  (optional)", state: hasFigma ? "done" : "pending", optional: true, hint: HINTS.figma },
  ];
}

/** ready = every non-optional step is not `pending` (warn is allowed — e.g. an
 * unratified soul still counts as set-up; git absence is `pending` and blocks). */
function computeReady(steps: Step[]): boolean {
  return steps.filter((s) => !s.optional).every((s) => s.state !== "pending");
}

/** First non-optional step that is actually `pending` (blocking), in table order
 * — or null when nothing is pending (a lone unratified soul is `warn`, not next). */
function firstPendingHint(steps: Step[]): string | null {
  const first = steps.find((s) => !s.optional && s.state === "pending");
  return first === undefined ? null : first.hint;
}

// ─── Text formatting ────────────────────────────────────────────────────────

function formatText(steps: Step[], ready: boolean, banner: boolean, templatesRoot: string): string {
  const lines: string[] = [];
  if (banner) lines.push(renderBanner(templatesRoot));
  lines.push(ruleHeader("onboarding", ready ? "READY" : "SETUP"));
  lines.push("");
  for (const step of steps) {
    lines.push(checkItem(step.state, step.label, step.hint));
  }
  lines.push("");
  const next = ready
    ? 'run `/ui:generate "<your idea>"` to start designing'
    : (firstPendingHint(steps) ?? 'run `/ui:generate "<your idea>"` to start designing');
  lines.push(`  next: ${next}`);
  lines.push("  explore what DESIGN:OS can do → `ui guide`");
  return lines.join("\n") + "\n";
}

// ─── Command handler ────────────────────────────────────────────────────────

export const onboardCommand = {
  name: CMD,
  summary: "Show this project's setup checklist and what to do next",
  hasSubcommands: false,
  help: ONBOARD_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const cwdFlag = parsed.flags["cwd"];
    const targetCwd = typeof cwdFlag === "string" ? cwdFlag : processCwd();
    const banner = parsed.flags["no-banner"] !== true;

    const steps = detectSteps(targetCwd);
    const ready = computeReady(steps);

    if (useJson) {
      return okJson(CMD, {
        steps: steps.map((s) => ({ id: s.id, state: s.state, optional: s.optional })),
        ready,
      });
    }

    const thisFile = fileURLToPath(import.meta.url);
    const { templatesRoot } = resolvePackageRoots(dirname(thisFile));
    return { exitCode: 0, stdout: formatText(steps, ready, banner, templatesRoot ?? "") };
  },
};
