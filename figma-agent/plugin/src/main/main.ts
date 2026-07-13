// Plugin MAIN thread — command dispatch loop.
// The UI relay (plugin/src/ui/ui-relay.ts) forwards CLI requests as
// {requestId, cmd, params}; every handler runs against the Figma scene and
// replies {requestId, ok:true, result} or {requestId, ok:false, error:{code,message}}.
// Orchestration handlers that need the dispatch itself (IMPORT_PAYLOAD, BATCH)
// live here; single-command executors live in executor-*.ts.

import type { CommandName, ErrorCode } from '../../../shared/protocol';
import type { FigmaExportPayload } from '../../../shared/figma-payload-types';
import {
  createColorStyles, createTextStyles, createEffectStyles,
  resetImportWarnings, getImportWarnings, withCode,
} from './executor-styles';
import { createVariablesFromTokens, opCreateVariable, opBindVariable } from './executor-variables';
import { createFigmaNode } from './executor-frame';
import { serializeDesignSystem } from './serialize-node';
import {
  opStatus, opGetSelection, opCreateFrame, opCreateInstance, opSetVariant,
  opSetAutoLayout, opSetConstraints, opSetText, opExportPng, opExecJs,
} from './executor-ops';

figma.showUI(__html__, { visible: true, width: 340, height: 480 }); // P2 panel chrome

// Announce scene identity to the UI iframe so the P2 panel's Connection details can
// show File/Page; ui-relay also forwards this to the broker (enriches PLUGIN_HELLO /
// `figma-agent status`). Re-announce on page change so the panel stays current.
function announceFileInfo(): void {
  figma.ui.postMessage({
    type: 'FILE_INFO',
    data: { fileName: figma.root.name, page: figma.currentPage.name },
  });
}
announceFileInfo();
figma.on('currentpagechange', announceFileInfo);

type Params = Record<string, unknown>;

interface UiRequest { requestId: string; cmd: CommandName; params?: Params }

figma.ui.onmessage = async (msg: unknown) => {
  const req = msg as Partial<UiRequest> | null;
  if (!req || typeof req.requestId !== 'string' || typeof req.cmd !== 'string') return; // relay chatter, not a command
  try {
    const result = await dispatch(req.cmd, req.params ?? {});
    figma.ui.postMessage({ requestId: req.requestId, ok: true, result });
  } catch (err) {
    figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err) });
  }
};

function shapeError(err: unknown): { code: ErrorCode; message: string } {
  const code = ((err as { code?: string } | null)?.code ?? 'E_PLUGIN_ERROR') as ErrorCode;
  const message = err instanceof Error ? err.message : String(err);
  return { code, message };
}

async function dispatch(cmd: CommandName, params: Params): Promise<unknown> {
  switch (cmd) {
    case 'STATUS': return opStatus();
    case 'GET_SELECTION': return opGetSelection(params);
    case 'SCAN_DESIGN_SYSTEM': return serializeDesignSystem();
    case 'CREATE_FRAME': return opCreateFrame(params);
    case 'CREATE_INSTANCE': return opCreateInstance(params);
    case 'SET_VARIANT': return opSetVariant(params);
    case 'CREATE_VARIABLE': return opCreateVariable(params);
    case 'BIND_VARIABLE': return opBindVariable(params);
    case 'SET_AUTOLAYOUT': return opSetAutoLayout(params);
    case 'SET_CONSTRAINTS': return opSetConstraints(params);
    case 'SET_TEXT': return opSetText(params);
    case 'EXPORT_PNG': return opExportPng(params);
    case 'EXEC_JS': return opExecJs(params);
    case 'IMPORT_PAYLOAD': return importPayload(params);
    case 'BATCH': return runBatch(params);
    default:
      // HTML_TO_FIGMA is handled entirely in the UI relay and arrives here as IMPORT_PAYLOAD
      throw withCode(new Error(`unknown command: ${cmd}`), 'E_INVALID_ARGS');
  }
}

/**
 * IMPORT_PAYLOAD: consume a FigmaExportPayload (ported EaseUI code.ts import
 * path): styles + variables from tokens → node tree → position → select.
 */
async function importPayload(params: Params): Promise<{ id: string; name: string; warnings: string[] }> {
  const payload = (params.payload ?? params) as FigmaExportPayload;
  if (!payload || typeof payload !== 'object' || !payload.rootNode) {
    throw withCode(new Error('IMPORT_PAYLOAD requires params.payload (FigmaExportPayload with rootNode)'), 'E_INVALID_ARGS');
  }
  resetImportWarnings();

  // 1. Local styles + variables from tokens (variables are de-duped on re-import);
  //    tokenVars (name → Variable) feeds tokenRefs binding during node build (P3 leg B)
  const tokens = payload.tokens ?? { colors: [], typography: [], spacing: [], radii: [], shadows: [] };
  const colorStyles = await createColorStyles(tokens.colors ?? []);
  await createTextStyles(tokens.typography ?? []);
  await createEffectStyles(tokens.shadows ?? []);
  const tokenVars = await createVariablesFromTokens(tokens);

  // 2. Build the node tree (tokenRefs bound inline via tokenVars)
  const root = await createFigmaNode(payload.rootNode, colorStyles, tokenVars);
  if (!root) throw new Error('payload rootNode produced no Figma node');

  // 3. Resolve replace target + parent BEFORE positioning
  let replaceTarget: SceneNode | null = null;
  if (typeof params.replaceId === 'string' && params.replaceId) {
    const t = await figma.getNodeByIdAsync(params.replaceId);
    if (t && t.type !== 'DOCUMENT' && t.type !== 'PAGE') replaceTarget = t as SceneNode;
  }
  let parent: BaseNode & ChildrenMixin = figma.currentPage;
  if (typeof params.parentId === 'string' && params.parentId) {
    const p = await figma.getNodeByIdAsync(params.parentId);
    if (p && 'appendChild' in p) parent = p as BaseNode & ChildrenMixin;
  }
  parent.appendChild(root);

  // 4. Position: replace target's coords > explicit x/y > viewport center
  if (replaceTarget) {
    root.x = replaceTarget.x;
    root.y = replaceTarget.y;
    replaceTarget.remove(); // only after the new node is placed successfully
  } else if (typeof params.x === 'number' && typeof params.y === 'number') {
    root.x = params.x;
    root.y = params.y;
  } else {
    root.x = Math.round(figma.viewport.center.x - root.width / 2);
    root.y = Math.round(figma.viewport.center.y - root.height / 2);
  }

  // 5. Select + bring into view (skip silently if parented to another page)
  try {
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
  } catch { /* root not on current page */ }

  figma.notify(`Imported "${payload.name}" (${(tokens.colors ?? []).length} colors, ${(tokens.typography ?? []).length} text styles)`);
  return { id: root.id, name: root.name, warnings: getImportWarnings() };
}

/** BATCH: sequential {cmd, params}[] through the same dispatch; stopOnError optional. */
async function runBatch(params: Params): Promise<{ results: unknown[] }> {
  const ops = Array.isArray(params) ? params : (params.ops as { cmd: CommandName; params?: Params }[]);
  if (!Array.isArray(ops)) {
    throw withCode(new Error('BATCH requires params.ops: {cmd, params}[]'), 'E_INVALID_ARGS');
  }
  const stopOnError = (params as Params).stopOnError === true;
  const results: unknown[] = [];
  for (const op of ops) {
    try {
      results.push({ ok: true, cmd: op.cmd, result: await dispatch(op.cmd, op.params ?? {}) });
    } catch (err) {
      results.push({ ok: false, cmd: op.cmd, error: shapeError(err) });
      if (stopOnError) break;
    }
  }
  return { results };
}
