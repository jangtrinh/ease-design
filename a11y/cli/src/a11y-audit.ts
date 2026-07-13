/**
 * `a11y-audit` — the optional tier-2 RENDERED accessibility "hands" for ease-design.
 *
 * Runs axe-core over live pages in system Chrome, catching the computed-style / contrast /
 * ARIA-usage classes that the deterministic tier-1 static linters (`ui a11y-lint`,
 * `ui ds a11y`) can't see. It is NEVER a conformance claim — see `knowledge/accessibility.md`
 * for the two-tier honesty model and the manual-judgment residue that always remains.
 *
 * This workspace is never imported by `dist/cli.js`; the `ui` binary stays browser-free.
 */
import { runAudit, DEFAULT_TAGS } from "./audit.ts";
import { okEnv, errEnv, formatText, MANUAL_RESIDUE } from "./envelope.ts";
import { NoBrowserError } from "./browser.ts";

const HELP = `a11y-audit — tier-2 RENDERED accessibility audit (axe-core over live Chrome)

Usage:
  a11y-audit <file.html|url> [more...] [--tags wcag2a,wcag2aa,wcag21aa] [--json]

What it does:
  Opens each target in installed Google Chrome (Playwright channel:chrome — no browser
  download) and runs axe-core over the live DOM. Catches computed-contrast, ARIA-usage and
  other rendered-only violation classes the static tier-1 linters cannot see.

  It reports VIOLATIONS FOUND — never a pass/conformance verdict. A clean run means
  "0 violations found by axe-core on the rules run; manual criteria remain". The residue a
  rendered scan can NEVER settle: ${MANUAL_RESIDUE}.

Options:
  --tags <list>   Comma-separated axe tag filter (default: ${DEFAULT_TAGS.join(",")})
  --json          Emit the JSON envelope instead of human-readable text
  -h, --help      Show this help

Exit code: 1 iff any violation is found (or the browser can't launch), else 0.
`;

interface Args {
  targets: string[];
  tags: string[] | undefined;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const targets: string[] = [];
  let tags: string[] | undefined;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] as string;
    if (tok === "-h" || tok === "--help") {
      help = true;
    } else if (tok === "--json") {
      json = true;
    } else if (tok === "--tags") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        tags = next.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
        i++;
      }
    } else {
      targets.push(tok);
    }
  }
  return { targets, tags, json, help };
}

function emitError(code: string, message: string, json: boolean): never {
  const env = errEnv(code, message);
  process.stdout.write(json ? JSON.stringify(env, null, 2) + "\n" : `a11y-audit: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { targets, tags, json, help } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(HELP);
    return;
  }
  if (targets.length === 0) {
    emitError("NO_TARGET", "a target is required, e.g. a11y-audit page.html", json);
  }

  let data;
  try {
    data = await runAudit(targets, tags !== undefined ? { tags } : {});
  } catch (e) {
    if (e instanceof NoBrowserError) emitError("NO_BROWSER", e.message, json);
    throw e;
  }

  process.stdout.write(json ? JSON.stringify(okEnv(data), null, 2) + "\n" : formatText(data));
  if (data.totals.violations > 0) process.exit(1);
}

main().catch((e: unknown) => {
  process.stderr.write(`a11y-audit: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
