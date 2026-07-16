// spec-005 P7 — the emitter half of the LIBRARY binding contract (the forward twin
// of scan-library-vars).
//
// A `libraryBindings` entry carries a publish KEY, not a name, so the reattach is
// `importVariableByKeyAsync(key)` → `setBoundVariable(field, variable)`. That call
// does NOT mint anything: it links this file to the ALREADY-PUBLISHED variable the
// scanned node was bound to — the same variable, not a copy. The only residue a
// rebuild can leave behind is the file's subscription to that library variable
// (Figma's own "used in this file" bookkeeping), which persists after the scratch
// rebuild is removed; no node, no local variable, no collection is created.
//
// WHY NOT resolveTokenVars' name lookup: a published variable is not in
// getLocalVariablesAsync at all, so there is no name to look up — that dead end IS
// the P5 finding (15 of 24 live diffs). The key is the only durable handle.

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { pushImportWarning } from './executor-styles';
import { bindVariableToField } from './executor-variables';

/** key → the imported Variable, or null once an import has been proven to fail.
 * Scoped to one import (main.importPayload resets it): a key appears on many nodes
 * of a design-system tree, and one network-backed import per key is enough. */
const importedByKey = new Map<string, Variable | null>();

/** Drop the per-import cache. Called at the top of IMPORT_PAYLOAD (and by tests). */
export function resetLibraryVariableCache(): void {
  importedByKey.clear();
}

/** Import once per key; a failure is remembered as null (warned once, not per node). */
async function importVariable(key: string): Promise<Variable | null> {
  const cached = importedByKey.get(key);
  if (cached !== undefined) return cached;
  let variable: Variable | null = null;
  try {
    variable = await figma.variables.importVariableByKeyAsync(key);
  } catch (err) {
    // Key unpublished, library unsubscribed, or the variable deleted at the source.
    pushImportWarning(`library variable import failed for key ${key}: ${String(err)}`);
  }
  importedByKey.set(key, variable);
  return variable;
}

/**
 * Reattach every library binding the spec recorded, field-for-field.
 *
 * Runs AFTER the node's own visuals are written (see executor-frame.createFigmaNode)
 * so the paint-copy binding path rebinds the paints actually applied. Nothing here
 * throws: an unimportable key or a field Figma refuses to bind warns and leaves the
 * literal value in place — a missed binding degrades, never destroys.
 */
export async function applyLibraryBindings(
  node: SceneNode,
  bindings: NonNullable<FigmaExportNode['libraryBindings']>,
): Promise<void> {
  for (const [field, ref] of Object.entries(bindings)) {
    if (!ref || typeof ref.key !== 'string' || !ref.key) continue;
    const variable = await importVariable(ref.key);
    if (!variable) {
      pushImportWarning(`library bind ${field}→${ref.name ?? ref.key} skipped on "${node.name}": key not importable — literal value kept`);
      continue;
    }
    try {
      bindVariableToField(node, field, variable);
    } catch (err) {
      pushImportWarning(`library bind ${field}→${ref.name ?? ref.key} failed on "${node.name}": ${String(err)}`);
    }
  }
}
