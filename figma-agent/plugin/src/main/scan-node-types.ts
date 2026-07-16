// Shared types for the reverse-walker (scan-node*.ts). Kept in their own module so
// the sub-walkers (layout / text / paint / instance) can type their `out` parameter
// without importing scan-node.ts back (circular import).

import type { FigmaExportNode } from '../../../shared/figma-payload-types';

/** Material captured beyond the reversible FigmaExportNode fields. */
export interface ScanExtensions {
  // Raw field → variable id, ALWAYS recorded. Ids that resolve against the token
  // map also become `tokenRefs` (reversible); ids that don't (library/remote
  // variables) stay here only — the loss stays visible instead of silent.
  figmaScanBindings?: Record<string, string>;
  // The raw node.type when the schema cannot model it: COMPONENT / COMPONENT_SET
  // still degrade to FRAME (their definition is the file's, not a payload's).
  // INSTANCE is NO LONGER here — it is a first-class type since spec-005 P2.
  figmaScanSourceType?: string;
  // Fields overridden on the instance's INNER children (deduped names). The mirror
  // models an instance as ref + node-level overrides only, so these do NOT survive
  // a rebuild — recorded to keep that loss visible (spec-005 P2 documented edge).
  figmaScanInnerOverrides?: string[];
  // Bound fields Figma's Plugin API REFUSES to replay on this node type (maxWidth
  // on TEXT — see shared/figma-unbindable-fields). They stay in figmaScanBindings
  // as raw ids; this names them so the loss reads as Figma's limit rather than
  // ours, and so the mirror can tell the two apart (spec-005 P9).
  figmaScanUnbindable?: string[];
}

export type ScannedNode = FigmaExportNode & ScanExtensions;
