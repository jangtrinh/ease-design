/**
 * `recall` — the optional semantic "mind" over ease-design's design memory.
 *
 * Two verbs:
 *   recall index   ORGANIZE — embed the ledger corpus (+ knowledge) into a vector view
 *   recall query   RETRIEVE — hybrid-rank it and emit a rank file for the ui binary
 *
 * This workspace is NEVER imported by `dist/cli.js`; the binary stays zero-dependency,
 * no-network, no-LLM. Knowledge only ever flows back into the ledger through
 * `ui memory record insight --refs …` (boundary invariant #3).
 */
import { runIndex, formatIndexReport } from "./cmd-index.ts";
import { runQuery, emit } from "./cmd-query.ts";
import { runReflect, formatReflect } from "./cmd-reflect.ts";
import { MODEL_ID } from "./embed.ts";

const HELP = `recall — semantic recall over ease-design's design memory (optional, local-only)

Usage:
  recall index [--project <dir>] [--home] [--knowledge <dir>] [--json]
  recall query "<text>" [--k <n>] [--project <dir>] [--home] [--out <file>] [--text] [--json]
  recall reflect <job-events.json> [--project <dir>] [--k <n>] [--json]

Commands:
  index    Embed new ledger events (and optionally the knowledge core) into the index.
           Incremental: only events after the stored cursor are embedded.
  query    Embed the question, fuse dense KNN + BM25 (RRF), weight by half-life decay,
           demote superseded knowledge, and emit the ranked ids.
  reflect  Assemble a job's events + their semantic neighbours into a packet for the
           HOST MODEL to distil ONE durable lesson from, plus the write-back command.
           recall never calls an LLM. Run 'recall index' first.

Options:
  --project <dir>   Project whose design/memory.vec.db to use (default: cwd)
  --home            Use the cross-project index (~/.ease-design/taste.vec.db)
  --knowledge <dir> index only: also embed this knowledge/ root into the same index
  --k <n>           query/reflect only: how many hits to return (default 8)
  --out <file>      query only: write the rank file here instead of stdout
  --text            query only: print the recalled items for a human
  --json            Emit a JSON envelope
  -h, --help        Show this help

Feeding the binary:
  recall query "why is the brand colour warm?" --out ids.json
  ui memory context --rank-file ids.json

Closing the loop after a job:
  recall index --project .                       # ORGANIZE
  recall reflect job-events.json --project .     # REFLECT → run the write-back it prints

Notes:
  Embeddings are LOCAL (${MODEL_ID}); nothing is sent over the network.
  The index is a rebuildable cache — delete it and re-run 'recall index'.
  Only ledger ids reach the rank file; knowledge hits appear under --text.
`;

interface Args {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: readonly string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] as string;
    if (tok === "-h" || tok === "--help") {
      flags["help"] = true;
    } else if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(tok);
    }
  }
  const command = positionals.shift();
  return { command, positionals, flags };
}

function fail(message: string): never {
  process.stderr.write(`recall: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  if (flags["help"] === true || command === undefined) {
    process.stdout.write(HELP);
    return;
  }

  const home = flags["home"] === true;
  const json = flags["json"] === true;
  const project = typeof flags["project"] === "string" ? flags["project"] : undefined;
  if (home && project !== undefined) fail("--home and --project are mutually exclusive");

  if (command === "index") {
    const knowledge = typeof flags["knowledge"] === "string" ? flags["knowledge"] : undefined;
    const report = await runIndex({ home, json, ...(project !== undefined ? { project } : {}), ...(knowledge !== undefined ? { knowledge } : {}) });
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatIndexReport(report));
    return;
  }

  if (command === "query") {
    const text = positionals[0];
    if (text === undefined || text.trim().length === 0) fail('query requires a question, e.g. recall query "why is the brand warm?"');
    const kRaw = flags["k"];
    const k = typeof kRaw === "string" ? Number.parseInt(kRaw, 10) : 8;
    if (!Number.isSafeInteger(k) || k <= 0) fail(`--k must be a positive integer, got '${String(kRaw)}'`);
    const out = typeof flags["out"] === "string" ? flags["out"] : undefined;
    const opts = { home, json, k, text: flags["text"] === true, ...(project !== undefined ? { project } : {}), ...(out !== undefined ? { out } : {}) };
    const result = await runQuery(text, opts);
    process.stdout.write(emit(result, opts));
    return;
  }

  if (command === "reflect") {
    if (home) fail("reflect writes back into one project's ledger — --home is not supported");
    const jobEvents = positionals[0];
    if (jobEvents === undefined) fail("reflect requires a <job-events.json> path");
    const kRaw = flags["k"];
    const k = typeof kRaw === "string" ? Number.parseInt(kRaw, 10) : 8;
    if (!Number.isSafeInteger(k) || k <= 0) fail(`--k must be a positive integer, got '${String(kRaw)}'`);
    const packet = await runReflect(jobEvents, { k, json, ...(project !== undefined ? { project } : {}) });
    process.stdout.write(json ? JSON.stringify(packet, null, 2) + "\n" : formatReflect(packet));
    return;
  }

  fail(`unknown command '${command}'. Run 'recall --help'.`);
}

main().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
