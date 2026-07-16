// Shared payload contract between the plugin UI converter (producer) and the
// plugin main-thread executor (consumer). Transcribed VERBATIM from
// EaseUI/app/src/lib/figma-export.ts:10-143 — field names must never drift,
// because the ported executor (EaseUI figma-plugin/code.ts) consumes exactly these.

export interface FigmaColor {
  r: number; // 0..1
  g: number;
  b: number;
  a: number;
}

export interface FigmaExportFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR';
  color?: FigmaColor;
  gradientStops?: { color: FigmaColor; position: number }[];
  gradientTransform?: [number, number, number][];
}

export interface FigmaExportEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  offset?: { x: number; y: number };
  radius: number;
  spread?: number;
  color?: FigmaColor;
}

/**
 * A binding addressed by its variable's publish KEY — the reversible path for any
 * binding tokenRefs cannot carry: a PUBLISHED (library / remote) variable, and a
 * LOCAL one bound to a field with no tokenRefs slot (fontFamily, fontSize,
 * fontWeight, lineHeight, maxWidth, per-side padding…).
 * `name` is trace only — never used to resolve the variable (the key is the join;
 * a name would re-open the same lookup dead ends this type exists to escape).
 */
export interface FigmaKeyedBinding {
  key: string;
  name?: string;
}

/**
 * One of an instance's INNER children, and the overridden field VALUES it carries
 * (spec-005 P11). `childKey` addresses the child relative to the MAIN component, so
 * it names the same node in any instance of that main — see
 * plugin/src/main/instance-inner-override-keys.ts for how it is derived (and for the
 * id-shape premise it rests on).
 * `fields` keys are Figma's raw `NodeChangeProperty` names (name, width, height,
 * layoutGrow, textAutoResize, primaryAxisSizingMode, counterAxisSizingMode) — an
 * inner override is replayed field-for-field, so it needs no slot mapping. Only
 * fields the rebuild can actually write are here; the rest stay a recorded loss in
 * `figmaScanInnerOverrides`.
 */
export interface FigmaInnerOverride {
  childKey: string;
  fields: Record<string, string | number>;
  /**
   * When the inner child is an INSTANCE, the main component it currently points at.
   * A user can SWAP an inner slot's component without detaching the outer instance —
   * the swap is the override, and it is invisible in `fields` (Figma reports the
   * fields the swap moved, e.g. name/width, not the swap itself). Recording the ref
   * lets the rebuild replay it with `swapComponent`; a ref equal to the main's own
   * child resolves to a no-op, so it is recorded unconditionally rather than guessed.
   */
  componentKey?: string;
  componentId?: string;
}

export interface FigmaExportNode {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'IMAGE' | 'GROUP' | 'INSTANCE';
  name: string;

  // Dimensions
  width?: number;
  height?: number;

  // Auto-Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'GRID' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: 'AUTO' | 'FIXED';
  counterAxisSizingMode?: 'AUTO' | 'FIXED';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutWrap?: 'WRAP' | 'NO_WRAP';
  counterAxisSpacing?: number; // separate row-gap for wrap layouts
  layoutSizingHorizontal?: 'FILL' | 'FIXED' | 'HUG';
  layoutSizingVertical?: 'FILL' | 'FIXED' | 'HUG';
  layoutGrow?: number;

  // Constraints
  maxWidth?: number;
  minWidth?: number;
  maxHeight?: number;
  minHeight?: number;

  // Grid layout (Figma native GRID mode)
  gridColumnCount?: number;
  gridRowCount?: number; // extension over EaseUI schema (native GRID support)
  gridRowGap?: number;
  gridColumnGap?: number;

  // Visual
  fills?: FigmaExportFill[];
  cornerRadius?: number;
  cornerRadii?: { tl: number; tr: number; br: number; bl: number };
  effects?: FigmaExportEffect[];
  opacity?: number;
  backgroundImageUrl?: string;
  backgroundSize?: string;
  backgroundPosition?: string;

  // Stroke
  strokes?: FigmaExportFill[];
  strokeWeight?: number;
  // Per-side weights, the ONLY truth for a node with individual strokes (a
  // border-bottom-only divider, say). Figma's `strokeWeight` getter answers
  // figma.mixed there, so `strokeWeight` above cannot carry it. Set, this wins:
  // assigning the uniform weight resets the four sides.
  strokeWeights?: { top: number; right: number; bottom: number; left: number };
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';

  // Text
  characters?: string;
  fontFamily?: string;
  fontStack?: string; // raw CSS font-family stack (primary + fallbacks) for registry match
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: number;
  letterSpacing?: number;
  wordSpacing?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textColor?: FigmaColor;
  textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'UPPER' | 'LOWER' | 'TITLE';
  textTruncation?: 'ENDING';

  // Visual effects
  blendMode?: string;
  rotation?: number;
  counterAxisAlignContent?: 'AUTO' | 'SPACE_BETWEEN';

  // Image / SVG
  imageUrl?: string;
  svgContent?: string;

  // Motion (Track 5 Commit-4): captured behavior.json keyframes, applied after the
  // node is built via node.applyManualKeyframeTrack (metronome-gated, no-ops if absent).
  motion?: {
    steps: { offset: number; style: { opacity?: string; transform?: string } }[];
    durationSec: number;
    easing?: string;
  };

  // Layout control
  clipsContent?: boolean;
  absolutePosition?: boolean;
  x?: number;
  y?: number;

  // Styled text segments
  textSegments?: FigmaTextSegment[];

  // Key-addressed variable bindings (spec 005 P7/P8) — the OTHER half of a binding.
  // A tokenRef is a NAME in one of five slots, and BOTH of those limits lose
  // bindings: a published library variable has no local name to look up, and a
  // field with no slot (font*, maxWidth, per-side padding…) has nowhere to travel
  // even when its variable is local. The reversible identity that clears both is the
  // variable's publish `key` (the variable twin of `componentKey`) — matched against
  // this file's local variables first, else linked back to the SAME variable by
  // `figma.variables.importVariableByKeyAsync`.
  // Keys are the RAW Figma node fields the scanner saw bound (fontFamily, fontSize,
  // cornerRadius, paddingTop…), NOT tokenRefs slots: a keyed binding is replayed
  // field-for-field, so it needs no lossy slot mapping. A field tokenRefs already
  // claims never appears here — one binding travels ONE reversible path.
  keyedBindings?: Record<string, FigmaKeyedBinding>;

  // Token bindings (P3): names reference entries in FigmaExportTokens by `name`.
  // Executor resolves each via resolve-or-create (de-duped) then setBoundVariable.
  tokenRefs?: {
    fill?: string;      // colors[].name
    stroke?: string;    // colors[].name
    textColor?: string; // colors[].name
    radius?: string;    // radii[].name
    gap?: string;       // spacing[].name  (itemSpacing)
    padding?: string;   // spacing[].name  (all four sides when uniform)
  };

  // Instance reference (spec 005 P2) — only meaningful when `type === 'INSTANCE'`.
  // An instance is modelled as REF + OVERRIDES, never as a copy of its inner tree:
  // the composition belongs to the main component, so a rebuild instantiates the
  // main and re-applies only what this instance overrides. `componentKey` is the
  // portable identity (published/library components, importComponentByKeyAsync);
  // `componentId` is the same-file fallback (local node id). At least one is needed
  // to rebuild — with neither resolvable the builder degrades to a plain frame and
  // warns (no silent loss).
  componentKey?: string;
  componentId?: string;
  componentName?: string; // trace only — never used to resolve the main component
  // Variant selection + component-property values, as `InstanceNode.setProperties`
  // consumes them (keys are Figma's property names, e.g. "State" or "Label#12:3").
  // Values are string (VARIANT / TEXT / INSTANCE_SWAP-key) or boolean (BOOLEAN) —
  // the only kinds the Plugin API accepts; a bound VariableAlias value has no
  // reversible slot here and is skipped by the walker.
  componentProperties?: Record<string, string | boolean>;
  // Per-child overrides INSIDE the instance, with their values (spec-005 P11) — the
  // reversible half of what `figmaScanInnerOverrides` records. Ref + componentProperties
  // rebuild the instance's composition; these carry back the ad-hoc edits made on its
  // inner children (a stretched row, a renamed slot). Reapplied AFTER createInstance +
  // setProperties, addressed by `childKey`, best-effort per field: a write Figma
  // refuses warns and the loss stays visible in `figmaScanInnerOverrides`.
  innerOverrides?: FigmaInnerOverride[];

  // Nesting
  children?: FigmaExportNode[];
}

export interface FigmaTextSegment {
  characters: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: number;
  letterSpacing?: number;
  textColor?: FigmaColor;
  textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'UPPER' | 'LOWER' | 'TITLE';
}

export interface FigmaExportTokens {
  colors: { name: string; hex: string; color: FigmaColor }[];
  typography: { name: string; family: string; size: number; weight: number; lineHeight?: number; letterSpacing?: number }[];
  spacing: { name: string; value: number }[];
  radii: { name: string; value: number }[];
  shadows: { name: string; css: string; effect: FigmaExportEffect }[];
}

export interface FigmaExportPayload {
  version: 1;
  name: string;
  width: number;
  height: number;
  tokens: FigmaExportTokens;
  rootNode: FigmaExportNode;
}
