// Variable creation with de-dup (reuse by resolved value + type + collection)
// and variable binding. Base port: EaseUI figma-plugin/code.ts:225-270
// (createVariables) — extended per phase-1 plan §3 (create-variable /
// bind-variable) with getLocalVariablesAsync de-dup lookup.

import type { FigmaExportTokens, FigmaExportNode, FigmaColor } from '../../../shared/figma-payload-types';
import { hexToFigmaColor, pushImportWarning, withCode } from './executor-styles';

const COLLECTION_NAME = 'EaseDesign Tokens';
const VARIABLE_TYPES = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'] as const;

// Paint-target fields bind via setBoundVariableForPaint; the rest via setBoundVariable.
const PAINT_FIELDS = ['fills', 'strokes'];
const BINDABLE_FIELDS = [
  'fills', 'strokes', 'cornerRadius', 'itemSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'width', 'height', 'opacity',
];

async function findOrCreateCollection(name: string): Promise<VariableCollection> {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  return all.find((c) => c.name === name) ?? figma.variables.createVariableCollection(name);
}

/** Value equality: colors with epsilon (round-trip tolerance), primitives strict. */
function valuesEqual(a: VariableValue, b: VariableValue): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && 'r' in a && 'r' in b) {
    const ca = a as RGBA; const cb = b as RGBA;
    const eps = 1 / 512;
    return Math.abs(ca.r - cb.r) < eps && Math.abs(ca.g - cb.g) < eps
      && Math.abs(ca.b - cb.b) < eps && Math.abs((ca.a ?? 1) - (cb.a ?? 1)) < eps;
  }
  return a === b;
}

/** De-dup lookup: local variable in this collection with same type + default-mode value. */
async function findReusableVariable(
  collection: VariableCollection,
  type: VariableResolvedDataType,
  value: VariableValue,
): Promise<Variable | null> {
  const vars = await figma.variables.getLocalVariablesAsync(type);
  const modeId = collection.modes[0].modeId;
  for (const v of vars) {
    if (v.variableCollectionId !== collection.id) continue;
    const existing = v.valuesByMode[modeId];
    if (existing === undefined) continue;
    if (typeof existing === 'object' && existing !== null && (existing as VariableAlias).type === 'VARIABLE_ALIAS') continue;
    if (valuesEqual(existing, value)) return v;
  }
  return null;
}

async function createOrReuseVariable(
  collection: VariableCollection,
  name: string,
  type: VariableResolvedDataType,
  value: VariableValue,
): Promise<{ variable: Variable; reused: boolean }> {
  const existing = await findReusableVariable(collection, type, value);
  if (existing) return { variable: existing, reused: true };
  const variable = figma.variables.createVariable(name, collection, type);
  variable.setValueForMode(collection.modes[0].modeId, value);
  return { variable, reused: false };
}

/**
 * IMPORT_PAYLOAD path: token → variables (colors COLOR, spacing/radii FLOAT).
 * Returns token-name → Variable so node builders can bind tokenRefs (P3 leg B).
 * De-dup note: a reused Variable may carry a different name than the token —
 * the map is ALWAYS keyed by the payload token name.
 */
export async function createVariablesFromTokens(tokens: FigmaExportTokens): Promise<Map<string, Variable>> {
  const byTokenName = new Map<string, Variable>();
  try {
    const collection = await findOrCreateCollection(COLLECTION_NAME);
    for (const t of tokens.colors ?? []) {
      const value: RGBA = { r: t.color.r, g: t.color.g, b: t.color.b, a: t.color.a };
      const { variable } = await createOrReuseVariable(collection, t.name, 'COLOR', value);
      byTokenName.set(t.name, variable);
    }
    for (const t of tokens.spacing ?? []) {
      const { variable } = await createOrReuseVariable(collection, t.name, 'FLOAT', t.value);
      byTokenName.set(t.name, variable);
    }
    for (const t of tokens.radii ?? []) {
      const { variable } = await createOrReuseVariable(collection, t.name, 'FLOAT', t.value);
      byTokenName.set(t.name, variable);
    }
  } catch (err) {
    // Free-plan variable caps etc. must not abort the whole import
    pushImportWarning(`variable creation failed (plan limits?): ${String(err)}`);
  }
  return byTokenName;
}

/**
 * Shared bind core (used by BIND_VARIABLE op AND payload tokenRefs):
 * paint fields via the paint-copy pattern (setBoundVariableForPaint on a
 * cloned paints array), everything else via setBoundVariable.
 */
export function bindVariableToField(node: SceneNode, field: string, variable: Variable): void {
  if (PAINT_FIELDS.includes(field)) {
    // Bind the variable to the color of the first paint (create one if absent)
    const target = node as unknown as Record<string, Paint[] | PluginAPI['mixed']>;
    const current = target[field];
    const paints: Paint[] = Array.isArray(current) && current.length > 0
      ? [...current]
      : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } } as SolidPaint];
    paints[0] = figma.variables.setBoundVariableForPaint(paints[0] as SolidPaint, 'color', variable);
    target[field] = paints;
  } else {
    node.setBoundVariable(field as VariableBindableNodeField, variable);
  }
}

/**
 * P3 leg B: bind a payload node's tokenRefs on the freshly built SceneNode.
 * fill/textColor → 'fills', stroke → 'strokes', radius → 'cornerRadius',
 * gap → 'itemSpacing', padding → all four padding fields. Failures warn and
 * skip — a missed binding must never abort the import.
 *
 * A tokenRef naming a variable this file has no local Variable for (a library /
 * remote token, spec-005 P1's known edge) warns and leaves the literal value in
 * place — never a crash, never a silent drop.
 */
export function applyTokenRefs(
  node: SceneNode,
  refs: NonNullable<FigmaExportNode['tokenRefs']>,
  tokenVars: Map<string, Variable>,
): void {
  const bind = (field: string, tokenName: string | undefined) => {
    if (!tokenName) return;
    const variable = tokenVars.get(tokenName);
    if (!variable) {
      pushImportWarning(`token bind ${field}→${tokenName} skipped on "${node.name}": no variable named "${tokenName}" in this file (library/remote token?) — literal value kept`);
      return;
    }
    try {
      bindVariableToField(node, field, variable);
    } catch (err) {
      pushImportWarning(`token bind ${field}→${tokenName} failed on "${node.name}": ${String(err)}`);
    }
  };
  bind('fills', refs.fill ?? refs.textColor); // TEXT nodes carry textColor; both target fills
  bind('strokes', refs.stroke);
  bind('cornerRadius', refs.radius);
  bind('itemSpacing', refs.gap);
  if (refs.padding) {
    bind('paddingTop', refs.padding);
    bind('paddingRight', refs.padding);
    bind('paddingBottom', refs.padding);
    bind('paddingLeft', refs.padding);
  }
}

/** CREATE_VARIABLE op → {id, name, reused}. */
export async function opCreateVariable(params: Record<string, unknown>): Promise<{ id: string; name: string; reused: boolean }> {
  const name = params.name;
  const type = params.type as VariableResolvedDataType;
  if (typeof name !== 'string' || !name) throw withCode(new Error('CREATE_VARIABLE requires params.name'), 'E_INVALID_ARGS');
  if (!VARIABLE_TYPES.includes(type as (typeof VARIABLE_TYPES)[number])) {
    throw withCode(new Error(`CREATE_VARIABLE type must be one of ${VARIABLE_TYPES.join('|')}`), 'E_INVALID_ARGS');
  }
  let value = params.value as VariableValue;
  if (type === 'COLOR' && typeof value === 'string') value = hexToFigmaColor(value) as unknown as RGBA;
  if (type === 'COLOR' && typeof value === 'object' && value !== null) {
    const c = value as FigmaColor;
    value = { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
  }
  if (type === 'FLOAT') value = Number(value);
  if (type === 'BOOLEAN' && typeof value === 'string') value = value === 'true';
  if (value === undefined || (type === 'FLOAT' && Number.isNaN(value))) {
    throw withCode(new Error('CREATE_VARIABLE requires a params.value matching the type'), 'E_INVALID_ARGS');
  }

  const collection = await findOrCreateCollection(typeof params.collection === 'string' && params.collection ? params.collection : COLLECTION_NAME);
  const { variable, reused } = await createOrReuseVariable(collection, name, type, value);
  // Optional named mode (creates only the value; mode must already exist)
  if (typeof params.mode === 'string') {
    const mode = collection.modes.find((m) => m.name === params.mode);
    if (mode) variable.setValueForMode(mode.modeId, value);
  }
  return { id: variable.id, name: variable.name, reused };
}

async function resolveVariable(ref: string): Promise<Variable> {
  if (ref.startsWith('VariableID:')) {
    const byId = await figma.variables.getVariableByIdAsync(ref);
    if (byId) return byId;
  }
  const all = await figma.variables.getLocalVariablesAsync();
  const byName = all.find((v) => v.name === ref);
  if (!byName) throw withCode(new Error(`variable not found: ${ref}`), 'E_INVALID_ARGS');
  return byName;
}

/** BIND_VARIABLE op → {id, field, variable}. */
export async function opBindVariable(params: Record<string, unknown>): Promise<{ id: string; field: string; variable: string }> {
  const nodeId = (params.nodeId ?? params.node) as string;
  const field = params.field as string;
  const ref = params.variable as string;
  if (typeof nodeId !== 'string' || typeof field !== 'string' || typeof ref !== 'string') {
    throw withCode(new Error('BIND_VARIABLE requires params.node, params.field, params.variable'), 'E_INVALID_ARGS');
  }
  if (!BINDABLE_FIELDS.includes(field)) {
    throw withCode(new Error(`BIND_VARIABLE field must be one of ${BINDABLE_FIELDS.join('|')}`), 'E_INVALID_ARGS');
  }
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw withCode(new Error(`node not found: ${nodeId}`), 'E_INVALID_ARGS');
  }
  const variable = await resolveVariable(ref);
  bindVariableToField(node as SceneNode, field, variable);
  return { id: node.id, field, variable: variable.name };
}
