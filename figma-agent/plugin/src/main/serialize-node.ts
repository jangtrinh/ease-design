// JSON-safe serialization: scene nodes (GET_SELECTION), arbitrary values
// (EXEC_JS results), and the design-system registry (SCAN_DESIGN_SYSTEM).

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: SerializedNode[];
}

/** Node → {id,name,type,x,y,width,height,children} down to `depth` levels. */
export function serializeNode(node: SceneNode, depth = 1): SerializedNode {
  const out: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: 'x' in node ? Math.round(node.x * 100) / 100 : 0,
    y: 'y' in node ? Math.round(node.y * 100) / 100 : 0,
    width: 'width' in node ? Math.round(node.width * 100) / 100 : 0,
    height: 'height' in node ? Math.round(node.height * 100) / 100 : 0,
  };
  if (depth > 0 && 'children' in node) {
    out.children = (node as SceneNode & ChildrenMixin).children.map((c) => serializeNode(c, depth - 1));
  }
  return out;
}

/** Make any value JSON-safe (drops functions/symbols, tolerates circular refs). */
export function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value, (_k, v) => {
      if (typeof v === 'function') return '[Function]';
      if (typeof v === 'bigint') return String(v);
      return v;
    }));
  } catch {
    return String(value); // circular or otherwise non-serializable
  }
}

/** Stringify a console argument for the EXEC_JS log capture. */
export function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/**
 * SCAN_DESIGN_SYSTEM: components/variants, variable tokens, local styles.
 * dynamic-page safe: loads all pages before findAllWithCriteria.
 */
export async function serializeDesignSystem(): Promise<Record<string, unknown>> {
  await figma.loadAllPagesAsync();

  // Components + component sets (variant children are covered by their set)
  const nodes = figma.root.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
  const components: Record<string, unknown>[] = [];
  for (const n of nodes) {
    if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
    const entry: Record<string, unknown> = { id: n.id, key: (n as ComponentNode).key, name: n.name, type: n.type };
    try {
      const defs = (n as ComponentSetNode).componentPropertyDefinitions;
      const axes: Record<string, string[]> = {};
      for (const [prop, def] of Object.entries(defs)) {
        if (def.type === 'VARIANT') axes[prop] = def.variantOptions ?? [];
      }
      if (Object.keys(axes).length > 0) entry.variantAxes = axes;
    } catch {
      // Plain components without property definitions
    }
    components.push(entry);
  }

  // Variable tokens (value resolved against the collection's default mode)
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const collectionName = new Map(collections.map((c) => [c.id, c.name]));
  const defaultMode = new Map(collections.map((c) => [c.id, c.modes[0] ? c.modes[0].modeId : '']));
  const tokens = variables.map((v) => ({
    id: v.id,
    name: v.name,
    type: v.resolvedType,
    collection: collectionName.get(v.variableCollectionId) ?? v.variableCollectionId,
    value: jsonSafe(v.valuesByMode[defaultMode.get(v.variableCollectionId) ?? ''] ?? null),
  }));

  // Local styles
  const paint = await figma.getLocalPaintStylesAsync();
  const text = await figma.getLocalTextStylesAsync();
  const effect = await figma.getLocalEffectStylesAsync();
  const styles = [
    ...paint.map((s) => ({ id: s.id, name: s.name, type: 'PAINT' })),
    ...text.map((s) => ({ id: s.id, name: s.name, type: 'TEXT' })),
    ...effect.map((s) => ({ id: s.id, name: s.name, type: 'EFFECT' })),
  ];

  return {
    components,
    tokens,
    styles,
    counts: { components: components.length, tokens: tokens.length, styles: styles.length },
  };
}
