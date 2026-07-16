// `figma-agent scan-node <nodeId>` — the LIVE half of the spec-005 spike.
// Reuses the EXEC_JS transport: bundles the reverse-walker (plugin/src/main/
// scan-node.ts) into a self-contained IIFE, injects it, resolves the node by id,
// and returns `nodeToSpec(node)` as JSON. Bundling the ACTUAL walker source (not a
// hand-copied string) keeps the injected code drift-free with the unit-tested one.
//
// SPIKE NOTE: bundling reads the walker TS source at runtime, so this command needs
// the repo checkout present (dist-only installs won't have plugin/src). That is
// acceptable for the spike — the owner runs it from the repo during the live pass.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  COMMAND_TIMEOUTS,
  EXEC_JS_MAX_TIMEOUT_MS,
} from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const WIRE_MARGIN_MS = 2_000;

/** Bundle the reverse-walker module into an IIFE exposing `__scan.nodeToSpec`. */
async function bundleWalker(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  // From cli/dist (bundled) OR cli/src/commands (ts-run) → plugin/src/main.
  const src = resolve(here, '../../plugin/src/main/scan-node.ts');
  const srcAlt = resolve(here, '../../../plugin/src/main/scan-node.ts');
  for (const entry of [src, srcAlt]) {
    try {
      const res = await build({
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        globalName: '__scan',
        platform: 'browser', // Figma sandbox: no node APIs
        target: 'es2020',
        write: false,
        logLevel: 'silent',
      });
      return res.outputFiles[0].text;
    } catch {
      // try the next candidate path
    }
  }
  throw new CliError('E_INVALID_ARGS', 'cannot locate plugin/src/main/scan-node.ts (repo checkout required)');
}

export async function run(args: CommandArgs): Promise<unknown> {
  const nodeId = args.positionals[0];
  if (!nodeId) throw new CliError('E_INVALID_ARGS', 'scan-node requires a <nodeId>');

  const walker = await bundleWalker();
  const code = `${walker}
const node = figma.getNodeById(${JSON.stringify(nodeId)});
if (!node) throw new Error('node not found: ' + ${JSON.stringify(nodeId)});
return __scan.nodeToSpec(node);`;

  const requested = args.num('timeout') ?? COMMAND_TIMEOUTS.EXEC_JS ?? 30_000;
  const timeoutMs = Math.min(requested, EXEC_JS_MAX_TIMEOUT_MS);
  return runCommand('EXEC_JS', { code, timeoutMs }, { timeoutMs: timeoutMs + WIRE_MARGIN_MS });
}
