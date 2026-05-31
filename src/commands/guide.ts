/**
 * `ui guide` command — the plain-language on-ramp for designers.
 *
 * ease-design is CLI-native: a designer drives it entirely through `/ui:*`
 * commands in an agent CLI. But `ui --help` lists 14 deterministic *plumbing*
 * commands (edit-strategy, parse-json-stream, …) that a designer would never
 * type — burying the actual workflow. `ui guide` is the antidote: an
 * intent-organized, jargon-free map of "what you can do and what to type",
 * with the binary commands clearly marked as under-the-hood.
 *
 * Pure: emits static guidance text (or JSON). No fs, no network, no subprocess.
 * The single source of truth for the designer-facing workflow map.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { ok, okJson } from "../core/output.js";

const CMD = "guide";

/**
 * The designer-facing workflow map, organized by intent ("I want to…").
 * Each entry: the plain-language goal, the command to type, and a one-liner.
 * Kept here as the SSOT so help text and JSON stay in sync.
 */
interface GuideStep {
  want: string;        // "I want to…"
  command: string;     // what the designer types
  detail: string;      // plain-language, no jargon
}

const WORKFLOW: GuideStep[] = [
  {
    want: "Start a new design from scratch",
    command: "/ui:generate <describe what you want>",
    detail: "e.g. /ui:generate landing page for a yoga studio, warm and calm — you get three variants to pick from, each already quality-checked.",
  },
  {
    want: "Tweak a design you like",
    command: "/ui:iterate <plain-words change>",
    detail: "e.g. /ui:iterate make the headline bigger and the shadows softer — describe the change in words; the system handles the rest.",
  },
  {
    want: "Polish without changing the look",
    command: "/ui:refine",
    detail: "A self-correction pass that fixes execution quality (spacing, type, alignment) while keeping the design identity.",
  },
  {
    want: "Try a bold, different direction",
    command: "/ui:redesign",
    detail: "Reimagines the same content with a deliberately contrasting visual style, keeping the structure intact.",
  },
  {
    want: "Match a screenshot or mockup",
    command: "/ui:from-ref <image>",
    detail: "Hand it a reference image and get a high-fidelity HTML version in your design system.",
  },
  {
    want: "Capture a live website's style",
    command: "/ui:from-url <url>",
    detail: "Extracts a real site's colors, type, and components into a reusable design spec.",
  },
  {
    want: "Bring in a Figma frame",
    command: "/ui:figma <file + node>",
    detail: "Reproduces a Figma frame as clean HTML.",
  },
  {
    want: "Build a slide deck",
    command: "/ui:slides <topic>",
    detail: "Generates a full, on-brand presentation, one slide at a time.",
  },
  {
    want: "Learn an existing site's design system",
    command: "/ui:extract <file.html>",
    detail: "The reverse of generate: turn existing HTML into a reusable token + component system.",
  },
];

const SETUP_NOTE =
  "Set up once per project with `/ui:init` (or `ui init --runtime claude`), and run `ui doctor` anytime to confirm everything's healthy.";

const QUALITY_NOTE =
  "Every design is scored on a 6+1-axis taste rubric before you see it — a deterministic floor (`ui taste-lint`) plus a critique pass — so weak, generic, or off-system output is caught automatically. You don't manage any of it.";

const UNDER_HOOD_NOTE =
  "The other `ui` commands (color, tokens, autofix, validate-layout, taste-lint, registry, edit-strategy, export, ds, designmd, …) are the deterministic engine. They run automatically as part of the workflow above — you rarely call them by hand. Developers can script them directly; `ui <command> --help` documents each.";

// ─── Text formatter ──────────────────────────────────────────────────────────

function formatGuide(): string {
  const lines: string[] = [];
  lines.push("ease-design — what you can do");
  lines.push("");
  lines.push("ease-design turns plain-language intent into production-grade UI. You drive it");
  lines.push("through `/ui:*` commands in your agent CLI — no design tokens to hand-edit, no");
  lines.push("config, no taste vocabulary to learn. Describe what you want; pick a result by eye.");
  lines.push("");
  lines.push("─── The workflow ───────────────────────────────────────────────");
  lines.push("");
  for (const step of WORKFLOW) {
    lines.push(`  ${step.want}`);
    lines.push(`    → ${step.command}`);
    lines.push(`      ${step.detail}`);
    lines.push("");
  }
  lines.push("─── Setup ──────────────────────────────────────────────────────");
  lines.push(`  ${SETUP_NOTE}`);
  lines.push("");
  lines.push("─── Quality, handled for you ───────────────────────────────────");
  lines.push(`  ${QUALITY_NOTE}`);
  lines.push("");
  lines.push("─── Under the hood (for developers) ────────────────────────────");
  lines.push(`  ${UNDER_HOOD_NOTE}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

// ─── Command handler ──────────────────────────────────────────────────────────

export const GUIDE_HELP = `ui guide — a plain-language map of what ease-design can do

Usage:
  ui guide [--json]

Shows the designer-facing workflow: which /ui:* command to type for each goal
(start a design, tweak it, match a screenshot, …), how setup works, and how
quality is enforced for you. The deterministic \`ui\` subcommands are the engine
underneath — listed in \`ui --help\`.

Options:
  --json     Emit the workflow map as a JSON envelope
  -h, --help Show this help
`;

export const guideCommand = {
  name: CMD,
  summary: "Plain-language map of the /ui:* workflow (start here if you're new)",
  hasSubcommands: false,
  help: GUIDE_HELP,

  run(parsed: ParsedArgs): CommandResult {
    if (parsed.json) {
      return okJson(CMD, {
        intro: "ease-design turns plain-language intent into production-grade UI, driven through /ui:* commands in an agent CLI.",
        workflow: WORKFLOW,
        setup: SETUP_NOTE,
        quality: QUALITY_NOTE,
        underTheHood: UNDER_HOOD_NOTE,
      });
    }
    return ok(formatGuide());
  },
};
