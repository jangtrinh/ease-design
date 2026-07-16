// `figma-agent scan-node <nodeId>` — the LIVE half of the spec-005 mirror.
// Reuses the EXEC_JS transport: injects the reverse-walker (plugin/src/main/
// scan-node.ts) as a self-contained IIFE, resolves the node by id, and returns
// `nodeToSpec(node)` as JSON. The injected code IS the ACTUAL walker source (not a
// hand-copied string), bundled at BUILD time into SCAN_NODE_WALKER_BUNDLE — so it
// stays drift-free with the unit-tested walker AND the command runs on a dist-only
// install, where neither plugin/src nor esbuild exists. See scripts/build.mjs.
import {
  COMMAND_TIMEOUTS,
  EXEC_JS_MAX_TIMEOUT_MS,
} from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { SCAN_NODE_WALKER_BUNDLE } from '../generated/scan-node-walker-bundle.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const WIRE_MARGIN_MS = 2_000;

export async function run(args: CommandArgs): Promise<unknown> {
  const nodeId = args.positionals[0];
  if (!nodeId) throw new CliError('E_INVALID_ARGS', 'scan-node requires a <nodeId>');

  // getNodeByIdAsync, not getNodeById: the plugin manifest declares
  // `documentAccess: "dynamic-page"`, under which the sync getter throws outright —
  // so the sync call could never resolve a node on a real canvas.
  // The id→name token map is read ONCE (async) and handed to the sync walker, so
  // variable bindings come back as reversible tokenRefs (spec-005 P1).
  const code = `${SCAN_NODE_WALKER_BUNDLE}
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node) throw new Error('node not found: ' + ${JSON.stringify(nodeId)});
const tokenNames = await __scan.readTokenNameMap();
return __scan.nodeToSpec(node, tokenNames);`;

  const requested = args.num('timeout') ?? COMMAND_TIMEOUTS.EXEC_JS ?? 30_000;
  const timeoutMs = Math.min(requested, EXEC_JS_MAX_TIMEOUT_MS);
  return runCommand('EXEC_JS', { code, timeoutMs }, { timeoutMs: timeoutMs + WIRE_MARGIN_MS });
}
