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

export interface FigmaExportNode {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'IMAGE' | 'GROUP';
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
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';

  // Text
  characters?: string;
  fontFamily?: string;
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

  // Layout control
  clipsContent?: boolean;
  absolutePosition?: boolean;
  x?: number;
  y?: number;

  // Styled text segments
  textSegments?: FigmaTextSegment[];

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
