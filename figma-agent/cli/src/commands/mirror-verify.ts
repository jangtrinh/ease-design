// `figma-agent mirror-verify <nodeId>` — the ONE-COMMAND gate of the spec-005
// mirror (P5). It closes the loop the two halves only imply separately:
//
//   scan-node  →  specA  →  IMPORT_PAYLOAD (rebuild)  →  scan-node  →  specB
//                              structuralDiff(specA, specB)
//
// `equal: true` means this node's representation is REVERSIBLE on the real canvas
// — the claim the fixed-point test only makes against a mock `figma`. `equal:
// false` names the fields that were lost, by path; the mirror never claims a
// round-trip it cannot show (Art II: a standard needs an emitter AND a linter).
//
// The rebuild is scratch: it is removed again unless `--keep` is passed, so the
// gate never litters the owner's canvas.
//
// VARIABLE BINDINGS — why the payload still carries EMPTY tokens:
// non-empty tokens would be a bug, not a feature. `createVariablesFromTokens`
// resolves by VALUE inside its own collection, so shipping tokens here would mint
// duplicate variables in the owner's file — a verification gate must not mutate
// what it verifies. The rebuild reattaches bindings WITHOUT them, through the
// import path's own two joins: a LOCAL variable by name (spec-005 P6,
// executor-token-var-resolve) and a PUBLISHED library variable by publish key
// (spec-005 P7, executor-library-vars → importVariableByKeyAsync, which links the
// existing variable rather than creating one). What neither join can reach — an id
// that is local to no file this one can see — still surfaces honestly as a
// `figmaScanBindings.*` diff plus the import's own warnings (see `warnings`).
import { COMMAND_TIMEOUTS } from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import { structuralDiff, type StructuralDiffEntry } from '../util/structural-diff.ts';
import {
  resolveScanTimeout, scanNodeSpec, type Runner, type ScannedSpec,
} from './scan-node.ts';

/** No tokens: see the header note — a gate must not mint variables in the file. */
const EMPTY_TOKENS = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };

export interface MirrorVerifyResult {
  nodeId: string;
  rebuiltId: string;
  equal: boolean;
  diffCount: number;
  diffs: StructuralDiffEntry[];
  keptRebuild: boolean;
  /** The rebuild's own import warnings (bindings skipped, main lost, …). */
  warnings: string[];
  /** Spec fields dropped before the diff — see normalizeForDiff. */
  normalized: string[];
}

/**
 * Fields dropped before comparing. The walker emits NO node id at all (see
 * plugin/src/main/scan-node.ts — the spec is identity-free by construction), so
 * nothing needs stripping for ids; `componentId` IS kept, because it names the
 * MAIN component, which the rebuild resolves to the same node.
 *
 * Only the ROOT's absolute `x`/`y` go: importPayload places the rebuilt root at
 * the viewport centre (main.ts step 4), so the coordinates are a property of WHEN
 * it ran, not of the node. Nested `x`/`y` (absolutely-positioned children) are
 * parent-relative and therefore structural — they stay in the diff.
 */
export const NORMALIZED_FIELDS = ['x (root)', 'y (root)'];

export function normalizeForDiff(spec: ScannedSpec): ScannedSpec {
  const { x: _x, y: _y, ...rest } = spec;
  return rest;
}

interface ImportReply { id?: string; name?: string; warnings?: string[] }

export interface MirrorVerifyOpts {
  parentId?: string;
  keep: boolean;
  timeoutMs: number;
}

export async function execute(
  nodeId: string,
  opts: MirrorVerifyOpts,
  run: Runner = runCommand,
): Promise<MirrorVerifyResult> {
  // 1. Scan the original — the same walker `scan-node` uses, not a copy.
  const specA = await scanNodeSpec(nodeId, opts.timeoutMs, run);

  // 2. Rebuild it from that spec alone. IMPORT_PAYLOAD is registered in the wire
  //    protocol and the UI relay forwards every non-HTML_TO_FIGMA command to the
  //    main thread unchanged, so a CLI call lands on the same handler the
  //    html-to-figma path uses.
  const imported = (await run('IMPORT_PAYLOAD', {
    payload: {
      version: 1,
      name: typeof specA.name === 'string' ? specA.name : 'mirror-verify',
      width: typeof specA.width === 'number' ? specA.width : 0,
      height: typeof specA.height === 'number' ? specA.height : 0,
      tokens: EMPTY_TOKENS,
      rootNode: specA,
    },
    parentId: opts.parentId,
  }, { timeoutMs: COMMAND_TIMEOUTS.IMPORT_PAYLOAD })) as ImportReply | null;

  const rebuiltId = imported?.id;
  if (!rebuiltId) throw new CliError('E_PLUGIN_ERROR', 'IMPORT_PAYLOAD returned no rebuilt node id');

  // 3. Scan the rebuild, then clean up — even if that second scan throws, so a
  //    failed verification never leaves scratch on the owner's canvas.
  let specB: ScannedSpec;
  try {
    specB = await scanNodeSpec(rebuiltId, opts.timeoutMs, run);
  } finally {
    if (!opts.keep) await removeNode(rebuiltId, opts.timeoutMs, run);
  }

  const { equal, diffs } = structuralDiff(normalizeForDiff(specA), normalizeForDiff(specB));
  return {
    nodeId,
    rebuiltId,
    equal,
    diffCount: diffs.length,
    diffs,
    keptRebuild: opts.keep,
    warnings: imported?.warnings ?? [],
    normalized: NORMALIZED_FIELDS,
  };
}

/** Best-effort scratch removal — a cleanup failure must not mask the verdict. */
async function removeNode(id: string, timeoutMs: number, run: Runner): Promise<void> {
  const code = `const n = await figma.getNodeByIdAsync(${JSON.stringify(id)});
if (n && 'remove' in n) n.remove();
return { removed: !!n };`;
  try {
    await run('EXEC_JS', { code, timeoutMs }, { timeoutMs: timeoutMs + 2_000 });
  } catch {
    // The verdict is already computed; a stranded scratch node is the owner's to
    // delete and is named in the result as `rebuiltId`.
  }
}

export async function run(args: CommandArgs): Promise<unknown> {
  const nodeId = args.positionals[0];
  if (!nodeId) throw new CliError('E_INVALID_ARGS', 'mirror-verify requires a <nodeId>');
  return execute(nodeId, {
    parentId: args.str('parent'),
    keep: args.bool('keep'),
    timeoutMs: resolveScanTimeout(args.num('timeout')),
  });
}
