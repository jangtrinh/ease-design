// Small readers shared by every reverse-walker module (scan-node*.ts).
// Pure, sync, never throwing — the walker runs in the Figma plugin sandbox and a
// single missing/mixed field must never abort a scan.

/** Round to 2 decimals (Figma reports sub-pixel sizes; the spec stores stable ones). */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Read a possibly-mixed / throwing field; returns undefined on symbol/throw. */
export function safe<T>(read: () => T): T | undefined {
  try {
    const v = read();
    if (typeof v === 'symbol') return undefined; // figma.mixed
    return v;
  } catch {
    return undefined;
  }
}

/** Read a variable-alias id off a boundVariables entry (array field or scalar field). */
export function aliasId(val: unknown): string | undefined {
  const alias = Array.isArray(val) ? val[0] : val;
  return (alias as { id?: string } | undefined)?.id;
}

/**
 * field→variable-id for every bound field on a node (its own fields AND its paints).
 *
 * Lives at this shared layer, not with any one of its callers: THREE readers ask the
 * same question now — the node-level join (scan-node-instance.readExtensions), the
 * publish-key pre-pass (scan-keyed-vars) and an inner child's visual override
 * (instance-inner-visual, spec-005 P15). Two of them would have had to import the
 * third's module, and the P15 one would have closed an import cycle. One reader is
 * also the point: a binding the pre-pass cannot see is a binding the rebuild cannot
 * reattach, so the two MUST look with the same eyes.
 */
export function readBindings(n: Record<string, unknown>): Record<string, string> {
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
  return rec;
}
