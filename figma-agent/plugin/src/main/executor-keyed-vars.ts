// spec-005 P7/P8 — the emitter half of the KEYED binding contract (the forward
// twin of scan-keyed-vars).
//
// A `keyedBindings` entry carries a publish KEY, not a name, so the reattach is
// key → Variable → `setBoundVariable(field, variable)`. The key resolves down two
// roads, tried in this order:
//
//   1. LOCAL, by key. A variable in THIS file carries a publish key too, and the
//      live probe of 25575:353653 proved that is the case that actually matters:
//      all 15 remaining diffs were local variables (`remote: false`) bound to font
//      fields. getLocalVariablesAsync lists them; matching on `.key` finds the
//      exact one the scan saw, with no name lookup and no network.
//   2. PUBLISHED, by import. `importVariableByKeyAsync(key)` does NOT mint
//      anything: it links this file to the ALREADY-PUBLISHED variable the scanned
//      node was bound to — the same variable, not a copy. The only residue a
//      rebuild can leave behind is the file's subscription to that library variable
//      (Figma's own "used in this file" bookkeeping), which persists after the
//      scratch rebuild is removed; no node, no local variable, no collection is
//      created.
//
// WHY NOT resolveTokenVars' name lookup: it reaches only the five fields tokenRefs
// models, and a published variable is not in getLocalVariablesAsync to be named at
// all. The key is the only handle that clears both walls.

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { pushImportWarning } from './executor-styles';
import { bindVariableToField } from './executor-variables';

/** key → the resolved Variable, or null once resolution has been proven to fail.
 * Scoped to one import (main.importPayload resets it): a key appears on many nodes
 * of a design-system tree, and one resolve per key is enough. */
const resolvedByKey = new Map<string, Variable | null>();

/** This file's local variables indexed by publish key, read at most once per import.
 * LAZY on purpose: the import creates its own token variables BEFORE any node is
 * built, so a map snapshotted at reset time would miss them. */
let localByKey: Map<string, Variable> | null = null;

/** Drop the per-import caches. Called at the top of IMPORT_PAYLOAD (and by tests). */
export function resetKeyedVariableCache(): void {
  resolvedByKey.clear();
  localByKey = null;
}

async function readLocalVariablesByKey(): Promise<Map<string, Variable>> {
  if (localByKey) return localByKey;
  const map = new Map<string, Variable>();
  try {
    for (const v of await figma.variables.getLocalVariablesAsync()) {
      if (typeof v.key === 'string' && v.key) map.set(v.key, v);
    }
  } catch {
    // A Variables API that refuses leaves the import road as the only one.
  }
  localByKey = map;
  return map;
}

/** Resolve once per key — local first, then a published import; a failure is
 * remembered as null (warned once, not per node).
 *
 * Exported since spec-005 P15: an inner child's bound paint resolves down the SAME
 * two roads, and its caller (executor-instance-inner-visual) rebinds one field rather
 * than a whole node's record — so it needs the resolution, not applyKeyedBindings'
 * loop. One resolver keeps the per-import cache, and the warning, in one place. */
export async function resolveKeyedVariable(key: string): Promise<Variable | null> {
  const cached = resolvedByKey.get(key);
  if (cached !== undefined) return cached;

  let variable: Variable | null = (await readLocalVariablesByKey()).get(key) ?? null;
  if (!variable) {
    try {
      variable = await figma.variables.importVariableByKeyAsync(key);
    } catch (err) {
      // Not local, and: key unpublished, library unsubscribed, or deleted at source.
      pushImportWarning(`variable resolve failed for key ${key}: not local, and import failed: ${String(err)}`);
    }
  }
  resolvedByKey.set(key, variable);
  return variable;
}

/**
 * Reattach every keyed binding the spec recorded, field-for-field.
 *
 * Runs AFTER the node's own visuals are written (see executor-frame.createFigmaNode)
 * so the paint-copy binding path rebinds the paints actually applied. Nothing here
 * throws: an unresolvable key or a field Figma refuses to bind warns and leaves the
 * literal value in place — a missed binding degrades, never destroys.
 */
export async function applyKeyedBindings(
  node: SceneNode,
  bindings: NonNullable<FigmaExportNode['keyedBindings']>,
): Promise<void> {
  for (const [field, ref] of Object.entries(bindings)) {
    if (!ref || typeof ref.key !== 'string' || !ref.key) continue;
    const variable = await resolveKeyedVariable(ref.key);
    if (!variable) {
      pushImportWarning(`keyed bind ${field}→${ref.name ?? ref.key} skipped on "${node.name}": key not resolvable — literal value kept`);
      continue;
    }
    try {
      bindVariableToField(node, field, variable);
    } catch (err) {
      pushImportWarning(`keyed bind ${field}→${ref.name ?? ref.key} failed on "${node.name}": ${String(err)}`);
    }
  }
}
