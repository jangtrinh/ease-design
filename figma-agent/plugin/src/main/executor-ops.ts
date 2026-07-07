// Read/write scene operations for the CLI command set (phase-1 plan §3):
// STATUS, GET_SELECTION, CREATE_FRAME, CREATE_INSTANCE, SET_VARIANT,
// SET_AUTOLAYOUT, SET_CONSTRAINTS, SET_TEXT, EXPORT_PNG, EXEC_JS.
// (CREATE_VARIABLE / BIND_VARIABLE live in executor-variables.ts;
// SCAN_DESIGN_SYSTEM in serialize-node.ts; IMPORT_PAYLOAD / BATCH in main.ts.)

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { loadBestFont } from './executor-fonts';
import { withCode } from './executor-styles';
import { applyAutoLayout } from './executor-frame';
import { serializeNode, jsonSafe, safeStringify } from './serialize-node';

export const PLUGIN_VERSION = '0.1.0';

type Params = Record<string, unknown>;

const LAYOUT_MODE_MAP: Record<string, FigmaExportNode['layoutMode']> = {
  H: 'HORIZONTAL', V: 'VERTICAL', HORIZONTAL: 'HORIZONTAL', VERTICAL: 'VERTICAL', GRID: 'GRID', NONE: 'NONE',
};
// [payload spec field, ...accepted CLI param aliases] — first defined alias wins
const NUM_PARAM_ALIASES: [keyof FigmaExportNode, ...string[]][] = [
  ['itemSpacing', 'gap', 'itemSpacing'], ['counterAxisSpacing', 'counterAxisSpacing'],
  ['gridRowCount', 'rows', 'gridRowCount'], ['gridColumnCount', 'cols', 'gridColumnCount'],
  ['gridRowGap', 'rowGap', 'gridRowGap'], ['gridColumnGap', 'colGap', 'gridColumnGap'],
  ['paddingTop', 'paddingTop'], ['paddingRight', 'paddingRight'],
  ['paddingBottom', 'paddingBottom'], ['paddingLeft', 'paddingLeft'],
];
const STR_PARAM_ALIASES: [keyof FigmaExportNode, string][] = [
  ['primaryAxisAlignItems', 'alignPrimary'], ['counterAxisAlignItems', 'alignCounter'],
  ['layoutSizingHorizontal', 'sizingH'], ['layoutSizingVertical', 'sizingV'],
];

/** CLI SET_AUTOLAYOUT params (short flags) → payload-shaped auto-layout spec. */
function normalizeAutoLayoutParams(params: Params): Partial<FigmaExportNode> {
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : undefined;
  const spec: Record<string, unknown> = {};
  const rawMode = params.mode ?? params.layoutMode;
  if (typeof rawMode === 'string') spec.layoutMode = LAYOUT_MODE_MAP[rawMode.toUpperCase()];
  // --pad t,r,b,l (string or array) first — individual padding* aliases override below
  const padList = Array.isArray(params.pad) ? params.pad : typeof params.pad === 'string' ? params.pad.split(',') : null;
  if (padList) {
    const [t, r, b, l] = padList.map((p) => num(p) ?? 0);
    spec.paddingTop = t; spec.paddingRight = r ?? t; spec.paddingBottom = b ?? t; spec.paddingLeft = l ?? r ?? t;
  }
  // CLI also sends padding as an object {top,right,bottom,left}
  if (params.padding && typeof params.padding === 'object') {
    const p = params.padding as Record<string, unknown>;
    if (num(p.top) !== undefined) spec.paddingTop = num(p.top);
    if (num(p.right) !== undefined) spec.paddingRight = num(p.right);
    if (num(p.bottom) !== undefined) spec.paddingBottom = num(p.bottom);
    if (num(p.left) !== undefined) spec.paddingLeft = num(p.left);
  }
  for (const [field, ...aliases] of NUM_PARAM_ALIASES) {
    for (const alias of aliases) {
      const v = num(params[alias]);
      if (v !== undefined) { spec[field] = v; break; }
    }
  }
  for (const [field, alias] of STR_PARAM_ALIASES) {
    if (typeof params[alias] === 'string') spec[field] = (params[alias] as string).toUpperCase();
  }
  if (params.wrap === true || params.wrap === 'WRAP') spec.layoutWrap = 'WRAP';
  return spec as Partial<FigmaExportNode>;
}

async function getSceneNode(id: unknown, label = 'node'): Promise<SceneNode> {
  if (typeof id !== 'string' || !id) throw withCode(new Error(`missing ${label} id`), 'E_INVALID_ARGS');
  const node = await figma.getNodeByIdAsync(id); // dynamic-page safe
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw withCode(new Error(`${label} not found: ${id}`), 'E_INVALID_ARGS');
  }
  return node as SceneNode;
}

async function appendToParent(node: SceneNode, params: Params): Promise<void> {
  const parentId = params.parentId ?? params.parent;
  if (typeof parentId === 'string' && parentId) {
    const parent = await figma.getNodeByIdAsync(parentId);
    if (parent && 'appendChild' in parent) (parent as BaseNode & ChildrenMixin).appendChild(node);
  }
  if (typeof params.x === 'number') node.x = params.x;
  if (typeof params.y === 'number') node.y = params.y;
}

export function opStatus(): Record<string, unknown> {
  return {
    fileName: figma.root.name,
    page: figma.currentPage.name,
    user: figma.currentUser ? figma.currentUser.name : null,
    pluginVersion: PLUGIN_VERSION,
  };
}

export function opGetSelection(params: Params): Record<string, unknown> {
  const depth = typeof params.depth === 'number' ? params.depth : 1;
  return { selection: figma.currentPage.selection.map((n) => serializeNode(n, depth)) };
}

export async function opCreateFrame(params: Params): Promise<{ id: string }> {
  const frame = figma.createFrame();
  frame.name = typeof params.name === 'string' && params.name ? params.name : 'Frame';
  const w = Number(params.width ?? params.w) || 100;
  const h = Number(params.height ?? params.h) || 100;
  frame.resize(w, h);
  await appendToParent(frame, params);
  return { id: frame.id };
}

export async function opCreateInstance(params: Params): Promise<Record<string, unknown>> {
  const ref = params.component ?? params.key ?? params.id;
  if (typeof ref !== 'string' || !ref) {
    throw withCode(new Error('CREATE_INSTANCE requires params.component (library key or local node id)'), 'E_INVALID_ARGS');
  }
  let component: ComponentNode | null = null;
  // Node ids contain ':'; library keys are hex — try key import first for key-looking refs
  if (!ref.includes(':')) {
    try { component = await figma.importComponentByKeyAsync(ref); } catch { /* fall through to local */ }
  }
  if (!component) {
    const local = await figma.getNodeByIdAsync(ref);
    if (local && local.type === 'COMPONENT') component = local;
    else if (local && local.type === 'COMPONENT_SET') component = local.defaultVariant;
  }
  if (!component) throw withCode(new Error(`component not found: ${ref}`), 'E_INVALID_ARGS');
  const instance = component.createInstance();
  await appendToParent(instance, params);
  return { id: instance.id, mainComponent: { id: component.id, key: component.key, name: component.name } };
}

export async function opSetVariant(params: Params): Promise<Record<string, unknown>> {
  const node = await getSceneNode(params.nodeId ?? params.node);
  if (node.type !== 'INSTANCE') {
    throw withCode(new Error(`SET_VARIANT target must be an INSTANCE, got ${node.type}`), 'E_INVALID_ARGS');
  }
  const props = params.props;
  if (!props || typeof props !== 'object') {
    throw withCode(new Error('SET_VARIANT requires params.props {property: value}'), 'E_INVALID_ARGS');
  }
  node.setProperties(props as Record<string, string>);
  const variantProps: Record<string, unknown> = {};
  try {
    for (const [k, v] of Object.entries(node.componentProperties)) variantProps[k] = v.value;
  } catch { /* componentProperties unavailable on detached edge cases */ }
  return { id: node.id, variantProps };
}

export async function opSetAutoLayout(params: Params): Promise<Record<string, unknown>> {
  const node = await getSceneNode(params.nodeId ?? params.node);
  if (!('layoutMode' in node)) {
    throw withCode(new Error(`node ${node.id} (${node.type}) does not support auto-layout`), 'E_INVALID_ARGS');
  }
  const applied = applyAutoLayout(node as FrameNode, normalizeAutoLayoutParams(params), false);
  return { id: node.id, applied };
}

export async function opSetConstraints(params: Params): Promise<{ id: string }> {
  const node = await getSceneNode(params.nodeId ?? params.node);
  if (!('constraints' in node)) {
    throw withCode(new Error(`node ${node.id} (${node.type}) does not support constraints`), 'E_INVALID_ARGS');
  }
  const horizontal = (params.horizontal ?? params.h ?? 'MIN') as ConstraintType;
  const vertical = (params.vertical ?? params.v ?? 'MIN') as ConstraintType;
  (node as SceneNode & ConstraintMixin).constraints = { horizontal, vertical };
  return { id: node.id };
}

export async function opSetText(params: Params): Promise<{ id: string }> {
  const node = await getSceneNode(params.nodeId ?? params.node);
  if (node.type !== 'TEXT') {
    throw withCode(new Error(`SET_TEXT target must be TEXT, got ${node.type}`), 'E_INVALID_ARGS');
  }
  // Editing characters requires ALL fonts currently on the node to be loaded
  if (node.characters.length > 0) {
    for (const f of node.getRangeAllFontNames(0, node.characters.length)) await figma.loadFontAsync(f);
  } else if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
  }
  // Optional font change via the loadBestFont fallback chain
  // (CLI sends fontFamily/fontWeight/fontSize; short aliases also accepted)
  const reqFamily = params.fontFamily ?? params.family;
  const reqWeight = params.fontWeight ?? params.weight;
  const reqSize = params.fontSize ?? params.size;
  if (typeof reqFamily === 'string' || typeof reqWeight === 'number') {
    const family = typeof reqFamily === 'string' && reqFamily
      ? reqFamily
      : node.fontName !== figma.mixed ? node.fontName.family : 'Inter';
    const weight = typeof reqWeight === 'number' ? reqWeight : 400;
    node.fontName = await loadBestFont(family, weight);
  }
  if (typeof params.characters === 'string') node.characters = params.characters;
  if (typeof reqSize === 'number') node.fontSize = reqSize;
  return { id: node.id };
}

export async function opExportPng(params: Params): Promise<{ base64: string; w: number; h: number }> {
  const id = params.nodeId ?? params.node;
  const target: SceneNode | null = typeof id === 'string' && id
    ? await getSceneNode(id)
    : figma.currentPage.selection[0] ?? null;
  if (!target) throw withCode(new Error('EXPORT_PNG: no node id given and selection is empty'), 'E_INVALID_ARGS');
  const scale = typeof params.scale === 'number' && params.scale > 0 ? params.scale : 2;
  const bytes = await target.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
  return {
    base64: figma.base64Encode(bytes),
    w: Math.round(target.width * scale),
    h: Math.round(target.height * scale),
  };
}

/** EXEC_JS: eval arbitrary Plugin-API code with console capture → {result, console, ms}. */
export async function opExecJs(params: Params): Promise<{ result: unknown; console: string[]; ms: number }> {
  const code = params.code ?? params.js;
  if (typeof code !== 'string' || !code.trim()) {
    throw withCode(new Error('EXEC_JS requires params.code (string)'), 'E_INVALID_ARGS');
  }
  const logs: string[] = [];
  const capture = (level: string) => (...args: unknown[]) => {
    logs.push(`[${level}] ${args.map(safeStringify).join(' ')}`);
  };
  const consoleProxy = { log: capture('log'), info: capture('info'), warn: capture('warn'), error: capture('error') };

  const t0 = Date.now();
  let fn: (c: typeof consoleProxy) => Promise<unknown>;
  try {
    // Expression-wrap first (REPL semantics: `figma.currentPage.name` returns a value),
    // then statement-wrap (scripts that use `return`). Indirect eval = global scope.
    try {
      fn = (0, eval)(`(async (console) => (${code}\n))`);
    } catch {
      fn = (0, eval)(`(async (console) => { ${code}\n })`);
    }
  } catch (err) {
    throw withCode(new Error(`syntax error: ${err instanceof Error ? err.message : String(err)}`), 'E_EVAL');
  }
  try {
    const result = await fn(consoleProxy);
    return { result: jsonSafe(result), console: logs, ms: Date.now() - t0 };
  } catch (err) {
    throw withCode(new Error(`runtime error: ${err instanceof Error ? err.message : String(err)}`), 'E_EVAL');
  }
}
