// Reverse-walker (spec 005 SPIKE): live SceneNode subtree → FigmaExportNode.
// The SYMMETRIC inverse of the build path — where build-frame.ts walks DOM+CSS
// into a FigmaExportNode and executor-frame.createFigmaNode replays that spec onto
// the canvas, `nodeToSpec` reads the ACTUAL node fields the executor writes back
// into a FigmaExportNode, so `node → spec → node` can be proven a fixed point.
//
// Pure + self-contained (only TYPE imports, erased at runtime) so the CLI
// `scan-node` command can inject `nodeToSpec.toString()` as an EXEC_JS script and
// the fixed-point harness can unit-test it against mock nodes. Runs in the Figma
// plugin sandbox (browser platform, no node APIs) — never throws on a missing field.
//
// SCOPE — variable bindings ARE reversible since spec-005 P1: `nodeToSpec` takes the
// file's id→name token map (see readTokenNameMap) and rebuilds `tokenRefs`, which the
// build path already reattaches by name. Still only *captured as an extension*, with
// no reversible slot: instance/component references (mainComponent) and nested-variant
// composition — FigmaExportNode has no instance type and createFigmaNode no instance
// build-case, so an INSTANCE cannot survive a round-trip (spec-005 P2's job).

import type {
  FigmaColor, FigmaExportEffect, FigmaExportFill, FigmaExportNode,
} from '../../../shared/figma-payload-types';
import { bindingsToTokenRefs } from './scan-token-refs';

/** Material captured beyond the reversible FigmaExportNode fields. */
export interface ScanExtensions {
  // Raw field → variable id, ALWAYS recorded. Ids that resolve against the token
  // map also become `tokenRefs` (reversible); ids that don't (library/remote
  // variables) stay here only — the loss stays visible instead of silent.
  figmaScanBindings?: Record<string, string>;
  // This node is an INSTANCE / COMPONENT — records the source. FigmaExportNode has
  // no instance type and createFigmaNode has no instance build-case → link is lost.
  figmaScanSourceType?: string;      // the raw node.type (INSTANCE / COMPONENT / …)
  figmaScanMainComponent?: string;   // mainComponent.id for an INSTANCE
}

export type ScannedNode = FigmaExportNode & ScanExtensions;

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Figma node.type → FigmaExportNode.type (the only 5 the schema models). */
function mapType(t: string): FigmaExportNode['type'] {
  if (t === 'TEXT') return 'TEXT';
  if (t === 'GROUP') return 'GROUP';
  if (t === 'RECTANGLE' || t === 'ELLIPSE' || t === 'VECTOR'
    || t === 'LINE' || t === 'STAR' || t === 'POLYGON') return 'RECTANGLE';
  return 'FRAME'; // FRAME / COMPONENT / COMPONENT_SET / INSTANCE / SECTION
}

/** Read a possibly-mixed / throwing field; returns undefined on symbol/throw. */
function safe<T>(read: () => T): T | undefined {
  try {
    const v = read();
    if (typeof v === 'symbol') return undefined; // figma.mixed
    return v;
  } catch {
    return undefined;
  }
}

/** One Figma Paint → FigmaExportFill (SOLID alpha lives in paint.opacity → color.a). */
function paintToFill(p: Paint): FigmaExportFill | null {
  if (p.type === 'SOLID') {
    const a = typeof p.opacity === 'number' ? p.opacity : 1;
    return { type: 'SOLID', color: { r: p.color.r, g: p.color.g, b: p.color.b, a } };
  }
  if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR') {
    const g = p as GradientPaint;
    return {
      type: p.type,
      gradientStops: g.gradientStops.map((s) => ({
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        position: s.position,
      })),
      gradientTransform: g.gradientTransform as unknown as [number, number, number][],
    };
  }
  return null; // IMAGE / VIDEO paints not modelled by this spike
}

/** Figma Effect → FigmaExportEffect (inverse of executor-styles.mapExportEffects). */
function effectToExport(e: Effect): FigmaExportEffect | null {
  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    return { type: e.type, radius: e.radius };
  }
  const s = e as DropShadowEffect;
  const c = s.color;
  return {
    type: e.type as FigmaExportEffect['type'],
    offset: { x: s.offset.x, y: s.offset.y },
    radius: s.radius,
    spread: s.spread ?? 0,
    color: { r: c.r, g: c.g, b: c.b, a: c.a },
  };
}

const asFills = (v: unknown): FigmaExportFill[] | undefined => {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out = (v as Paint[]).map(paintToFill).filter((f): f is FigmaExportFill => f !== null);
  return out.length ? out : undefined;
};

/** Auto-layout + sizing block — the symmetric core of applyAutoLayout/child-sizing. */
function readLayout(n: Record<string, unknown>, out: ScannedNode): void {
  const mode = n.layoutMode as string | undefined;
  if (mode && mode !== 'NONE') {
    out.layoutMode = mode as FigmaExportNode['layoutMode'];
    if (typeof n.itemSpacing === 'number') out.itemSpacing = n.itemSpacing;
    for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
      if (typeof n[k] === 'number') out[k] = n[k] as number;
    }
    if (n.primaryAxisSizingMode) out.primaryAxisSizingMode = n.primaryAxisSizingMode as 'AUTO' | 'FIXED';
    if (n.counterAxisSizingMode) out.counterAxisSizingMode = n.counterAxisSizingMode as 'AUTO' | 'FIXED';
    if (n.primaryAxisAlignItems) out.primaryAxisAlignItems = n.primaryAxisAlignItems as FigmaExportNode['primaryAxisAlignItems'];
    if (n.counterAxisAlignItems) out.counterAxisAlignItems = n.counterAxisAlignItems as FigmaExportNode['counterAxisAlignItems'];
    if (n.layoutWrap === 'WRAP') out.layoutWrap = 'WRAP';
    if (typeof n.counterAxisSpacing === 'number') out.counterAxisSpacing = n.counterAxisSpacing;
    if (n.counterAxisAlignContent === 'SPACE_BETWEEN') out.counterAxisAlignContent = 'SPACE_BETWEEN';
    if (mode === 'GRID') {
      for (const k of ['gridColumnCount', 'gridRowCount', 'gridRowGap', 'gridColumnGap'] as const) {
        if (typeof n[k] === 'number') out[k] = n[k] as number;
      }
    }
  }
}

/** Self-sizing — set by the PARENT's child-sizing loop; readable on ANY child (incl. TEXT). */
function readSelfSizing(n: Record<string, unknown>, out: ScannedNode): void {
  const h = safe(() => n.layoutSizingHorizontal as string);
  const v = safe(() => n.layoutSizingVertical as string);
  if (h === 'FILL' || h === 'FIXED' || h === 'HUG') out.layoutSizingHorizontal = h;
  if (v === 'FILL' || v === 'FIXED' || v === 'HUG') out.layoutSizingVertical = v;
  if (typeof n.layoutGrow === 'number' && n.layoutGrow > 0) out.layoutGrow = n.layoutGrow;
}

// Inverse of executor-fonts.getFontStyleVariants: a Figma style name → numeric
// weight. Only recovers the weight the build path could have emitted; unknown
// styles leave fontWeight unset (documented reversibility limit).
function styleToWeight(style: string): number | undefined {
  const s = style.toLowerCase().replace(/\s|italic/g, '');
  const map: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
    regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
    bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
  };
  return map[s];
}

/** Text-only fields — inverse of executor-text.createTextNode. */
function readText(n: Record<string, unknown>, out: ScannedNode): void {
  if (typeof n.characters === 'string') out.characters = n.characters;
  const font = safe(() => n.fontName as FontName);
  if (font && typeof font === 'object' && 'family' in font) {
    out.fontFamily = font.family;
    if (font.style.toLowerCase().includes('italic')) out.fontStyle = 'italic';
    const w = styleToWeight(font.style);
    if (w !== undefined) out.fontWeight = w;
  }
  if (typeof n.fontSize === 'number') out.fontSize = n.fontSize;
  const lh = safe(() => n.lineHeight as LineHeight);
  if (lh && typeof lh === 'object' && lh.unit === 'PIXELS') out.lineHeight = lh.value;
  const ls = safe(() => n.letterSpacing as LetterSpacing);
  if (ls && typeof ls === 'object' && ls.unit === 'PIXELS') out.letterSpacing = ls.value;
  if (n.textAlignHorizontal) out.textAlignHorizontal = n.textAlignHorizontal as FigmaExportNode['textAlignHorizontal'];
  if (n.textAutoResize) out.textAutoResize = n.textAutoResize as FigmaExportNode['textAutoResize'];
  if (n.textDecoration && n.textDecoration !== 'NONE') out.textDecoration = n.textDecoration as FigmaExportNode['textDecoration'];
  if (n.textCase && n.textCase !== 'ORIGINAL') out.textCase = n.textCase as FigmaExportNode['textCase'];
  // TEXT colour lives in fills[0]; surface it as textColor (build-path convention).
  const fills = asFills(n.fills);
  if (fills && fills[0]?.type === 'SOLID' && fills[0].color) out.textColor = fills[0].color as FigmaColor;
}

/** Read a variable-alias id off a boundVariables entry (array field or scalar field). */
function aliasId(val: unknown): string | undefined {
  const alias = Array.isArray(val) ? val[0] : val;
  return (alias as { id?: string } | undefined)?.id;
}

/**
 * The file's variable id → name map — the join source that makes bindings
 * reversible. Same source as serializeDesignSystem's `tokens` (local variables
 * only; library/remote variables are NOT listed → documented edge). Async, so it
 * runs ONCE per scan and keeps `nodeToSpec` synchronous; never throws.
 */
export async function readTokenNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const vars = await figma.variables.getLocalVariablesAsync();
    for (const v of vars) map.set(v.id, v.name);
  } catch {
    // Variables API unavailable (older Figma / restricted plan) → no tokenRefs.
  }
  return map;
}

/** Capture bindings (→ tokenRefs when resolvable) + the instance ref (gap 2). */
function readExtensions(
  n: Record<string, unknown>,
  out: ScannedNode,
  tokenNames: Map<string, string> | undefined,
): void {
  const rec: Record<string, string> = {};
  // Scalar fields (cornerRadius, itemSpacing, padding…) live on node.boundVariables.
  const bound = safe(() => n.boundVariables as Record<string, unknown>);
  if (bound && typeof bound === 'object') {
    for (const [field, val] of Object.entries(bound)) {
      const id = aliasId(val);
      if (id) rec[field] = id;
    }
  }
  // Paint fields (fills/strokes) record the alias on the PAINT, not the node.
  for (const field of ['fills', 'strokes'] as const) {
    const paints = safe(() => n[field] as Array<Record<string, unknown>>);
    if (!Array.isArray(paints)) continue;
    for (const p of paints) {
      const id = aliasId((p.boundVariables as { color?: unknown } | undefined)?.color);
      if (id) { rec[field] = id; break; }
    }
  }
  if (Object.keys(rec).length) {
    out.figmaScanBindings = rec;
    const refs = bindingsToTokenRefs(rec, out.type, tokenNames);
    if (refs) out.tokenRefs = refs;
  }
  const type = n.type as string;
  if (type === 'INSTANCE' || type === 'COMPONENT' || type === 'COMPONENT_SET') {
    out.figmaScanSourceType = type;
    const main = safe(() => (n.mainComponent as { id?: string } | null)?.id);
    if (main) out.figmaScanMainComponent = main;
  }
}

/**
 * Walk one live SceneNode subtree → FigmaExportNode (+ scan extensions).
 * `tokenNames` (from readTokenNameMap) turns variable ids into reversible
 * tokenRefs; omit it and bindings degrade to raw ids only.
 * INSTANCE composition is NOT recursed (audit rule L106) — its inner tree is the
 * component's, not the instance's, and has no reversible representation here.
 */
export function nodeToSpec(node: SceneNode, tokenNames?: Map<string, string>): ScannedNode {
  const n = node as unknown as Record<string, unknown>;
  const type = node.type;
  const out: ScannedNode = { type: mapType(type), name: node.name };

  const w = safe(() => node.width);
  const h = safe(() => node.height);
  if (typeof w === 'number' && w > 0) out.width = r2(w);
  if (typeof h === 'number' && h > 0) out.height = r2(h);

  readSelfSizing(n, out); // applies to text + frame children alike

  if (out.type === 'TEXT') {
    readText(n, out);
  } else {
    readLayout(n, out);
    out.fills = asFills(n.fills);
    if (out.fills === undefined) delete out.fills;

    // Corner radius: uniform number, else per-corner (getter throws figma.mixed).
    const cr = safe(() => n.cornerRadius as number);
    if (typeof cr === 'number' && cr > 0) {
      out.cornerRadius = cr;
    } else {
      const tl = safe(() => n.topLeftRadius as number) ?? 0;
      const tr = safe(() => n.topRightRadius as number) ?? 0;
      const br = safe(() => n.bottomRightRadius as number) ?? 0;
      const bl = safe(() => n.bottomLeftRadius as number) ?? 0;
      if (tl || tr || br || bl) out.cornerRadii = { tl, tr, br, bl };
    }

    const strokes = asFills(n.strokes);
    if (strokes) {
      out.strokes = strokes;
      if (typeof n.strokeWeight === 'number') out.strokeWeight = n.strokeWeight;
      if (n.strokeAlign) out.strokeAlign = n.strokeAlign as FigmaExportNode['strokeAlign'];
    }

    for (const k of ['maxWidth', 'minWidth', 'maxHeight', 'minHeight'] as const) {
      if (typeof n[k] === 'number') out[k] = n[k] as number;
    }
    if (n.clipsContent === true) out.clipsContent = true;
    if (n.blendMode && n.blendMode !== 'PASS_THROUGH' && n.blendMode !== 'NORMAL') {
      out.blendMode = n.blendMode as string;
    }
  }

  // Shared visual fields (frame + text): effects, opacity, rotation.
  const effects = safe(() => n.effects as Effect[]);
  if (Array.isArray(effects) && effects.length) {
    const mapped = effects.map(effectToExport).filter((e): e is FigmaExportEffect => e !== null);
    if (mapped.length) out.effects = mapped;
  }
  if (typeof n.opacity === 'number' && n.opacity < 1 && n.opacity > 0) out.opacity = n.opacity;
  if (typeof n.rotation === 'number' && Math.abs(n.rotation) > 0.001) out.rotation = n.rotation;

  readExtensions(n, out, tokenNames);

  // Children — recurse, EXCEPT into an instance (composition is the component's).
  if (type !== 'INSTANCE' && 'children' in node) {
    const kids = (node as SceneNode & ChildrenMixin).children;
    if (kids.length) out.children = kids.map((c) => nodeToSpec(c as SceneNode, tokenNames));
  }

  return out;
}
