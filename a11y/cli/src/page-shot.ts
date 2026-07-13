/**
 * `page-shot` — the optional RENDER hand for ease-design.
 *
 * Opens each target in installed Google Chrome (Playwright channel:chrome — no browser
 * download) at a fixed viewport width and writes a full-page PNG per target. It is a pure
 * renderer: pair it with the deterministic `ui vr gate` to diff the shots against baselines.
 * The `ui` binary never imports this workspace and stays browser-free.
 */
import { NoBrowserError } from "./browser.ts";
import { captureShots, DEFAULT_WIDTH } from "./shoot.ts";
import { errEnv, formatText, okEnv } from "./shot-envelope.ts";

const HELP = `page-shot — deterministic full-page PNG screenshots (system Chrome via channel:chrome)

Usage:
  page-shot <file.html|url> [more...] --out <dir> [--width ${DEFAULT_WIDTH}] [--json]

What it does:
  Opens each target in installed Google Chrome (no browser download) at a fixed viewport
  width and device-scale 1, then writes a full-page PNG to <dir>/<stem>.png, where <stem>
  is the input file name without its extension. Same page + same machine/fonts → same pixels,
  which is exactly what \`ui vr gate\` needs to diff renders against committed baselines.

  It is a RENDERER, not an auditor: it makes no accessibility or conformance claim.

Options:
  --out <dir>     Directory to write PNGs into (required; created if missing)
  --width <px>    Viewport width in CSS px (default ${DEFAULT_WIDTH}; device-scale fixed at 1)
  --json          Emit the JSON envelope instead of human-readable text
  -h, --help      Show this help

Exit code: 1 iff any target fails to render (or the browser can't launch), else 0.
`;

interface Args {
  targets: string[];
  out: string | undefined;
  width: number | undefined;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const targets: string[] = [];
  let out: string | undefined;
  let width: number | undefined;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] as string;
    if (tok === "-h" || tok === "--help") {
      help = true;
    } else if (tok === "--json") {
      json = true;
    } else if (tok === "--out") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out = next;
        i++;
      }
    } else if (tok === "--width") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        const w = Number(next);
        if (Number.isFinite(w) && w > 0) width = w;
        i++;
      }
    } else {
      targets.push(tok);
    }
  }
  return { targets, out, width, json, help };
}

function emitError(code: string, message: string, json: boolean): never {
  const env = errEnv(code, message);
  process.stdout.write(json ? JSON.stringify(env, null, 2) + "\n" : `page-shot: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { targets, out, width, json, help } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(HELP);
    return;
  }
  if (targets.length === 0) {
    emitError("NO_TARGET", "a target is required, e.g. page-shot page.html --out shots/", json);
  }
  if (out === undefined) {
    emitError("NO_OUT", "--out <dir> is required (where to write the PNGs)", json);
  }

  let data;
  try {
    data = await captureShots(targets, width !== undefined ? { outDir: out, width } : { outDir: out });
  } catch (e) {
    if (e instanceof NoBrowserError) emitError("NO_BROWSER", e.message, json);
    throw e;
  }

  process.stdout.write(json ? JSON.stringify(okEnv(data), null, 2) + "\n" : formatText(data));
  if (data.errors.length > 0) process.exit(1);
}

main().catch((e: unknown) => {
  process.stderr.write(`page-shot: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
