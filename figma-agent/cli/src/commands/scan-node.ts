// `figma-agent scan-node <nodeId>` — the LIVE half of the spec-005 mirror.
// Reuses the EXEC_JS transport: injects the reverse-walker (plugin/src/main/
// scan-node.ts) as a self-contained IIFE, resolves the node by id, and returns
// `nodeToSpec(node)` as JSON. The injected code IS the ACTUAL walker source (not a
// hand-copied string), bundled at BUILD time into SCAN_NODE_WALKER_BUNDLE — so it
// stays drift-free with the unit-tested walker AND the command runs on a dist-only
// install, where neither plugin/src nor esbuild exists. See scripts/build.mjs.
//
// `scanNodeSpec` is exported so the OTHER half of the mirror (mirror-verify) scans
// through the exact same walker + timeout policy instead of copying this code.
import {
  COMMAND_TIMEOUTS,
  EXEC_JS_MAX_TIMEOUT_MS,
} from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { SCAN_NODE_WALKER_BUNDLE } from '../generated/scan-node-walker-bundle.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const WIRE_MARGIN_MS = 2_000;

/** Transport seam — the real `runCommand` in production, a recorder in tests. */
export type Runner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

/** The walker's output, opaque to the CLI: plain JSON, compared structurally. */
export type ScannedSpec = Record<string, unknown>;

/**
 * Unwrap the EXEC_JS reply envelope — `{result, console, ms}` (see executor-ops
 * .opExecJs) — down to the walker's actual return value.
 *
 * This is not cosmetic. Without it `scan-node` emits the envelope as if it were the
 * spec, and mirror-verify hands THAT to IMPORT_PAYLOAD as its rootNode: a "node"
 * with no type and no name, which the builder faithfully tries to build, and Figma
 * rejects with `in set_name: Property "name" failed validation: Required value
 * missing` — the whole rebuild dead before the first real node (confirmed live: the
 * crash left one default-named 100×100 orphan frame on the canvas). Every test
 * missed it because the fake Runner returned a bare spec; only the real plugin
 * wraps. Recognised by shape, so a bare spec (the fixture case) passes through.
 */
export function unwrapExecJsReply(reply: unknown): ScannedSpec {
  const r = reply as Record<string, unknown> | null;
  const spec = r && typeof r === 'object' && 'result' in r && ('console' in r || 'ms' in r)
    ? r.result
    : r;
  if (!spec || typeof spec !== 'object' || typeof (spec as ScannedSpec).type !== 'string') {
    throw new CliError('E_PLUGIN_ERROR', `scan returned no usable spec: ${JSON.stringify(reply)?.slice(0, 200)}`);
  }
  return spec as ScannedSpec;
}

/** Clamp a requested timeout into the EXEC_JS policy (default → cap). */
export function resolveScanTimeout(requested?: number): number {
  return Math.min(requested ?? COMMAND_TIMEOUTS.EXEC_JS ?? 30_000, EXEC_JS_MAX_TIMEOUT_MS);
}

/**
 * Scan ONE node into a FigmaExportNode spec, through the bundled walker.
 *
 * getNodeByIdAsync, not getNodeById: the plugin manifest declares
 * `documentAccess: "dynamic-page"`, under which the sync getter throws outright —
 * so the sync call could never resolve a node on a real canvas.
 * The id→name token map is read ONCE (async) and handed to the sync walker, so
 * variable bindings come back as reversible tokenRefs (spec-005 P1). The main
 * component of every INSTANCE is resolved by the same trick — one async pre-pass
 * (getMainComponentAsync; the sync getter throws under dynamic-page) whose map the
 * sync walker reads, so component refs survive the scan. A THIRD pre-pass
 * (readKeyedVariableMap, spec-005 P7/P8) resolves EVERY bound variable — local and
 * published alike — to its publish key, the only handle a rebuild can reattach a
 * binding by when the tokenRefs name-join cannot carry it (a published variable has
 * no local name; a font field has no slot).
 */
export async function scanNodeSpec(
  nodeId: string,
  timeoutMs: number,
  run: Runner = runCommand,
): Promise<ScannedSpec> {
  const code = `${SCAN_NODE_WALKER_BUNDLE}
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node) throw new Error('node not found: ' + ${JSON.stringify(nodeId)});
const tokenNames = await __scan.readTokenNameMap();
const mainComps = await __scan.readMainComponentMap(node);
const keyedVars = await __scan.readKeyedVariableMap(node);
return __scan.nodeToSpec(node, tokenNames, mainComps, keyedVars);`;
  const reply = await run('EXEC_JS', { code, timeoutMs }, { timeoutMs: timeoutMs + WIRE_MARGIN_MS });
  return unwrapExecJsReply(reply);
}

export async function run(args: CommandArgs): Promise<unknown> {
  const nodeId = args.positionals[0];
  if (!nodeId) throw new CliError('E_INVALID_ARGS', 'scan-node requires a <nodeId>');
  return scanNodeSpec(nodeId, resolveScanTimeout(args.num('timeout')));
}
