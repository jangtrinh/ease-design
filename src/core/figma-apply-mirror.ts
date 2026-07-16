/**
 * Mirror half of the apply core (spec 005 P4) — how one captured Figma node spec becomes
 * a registry record + a sidecar. Pure; split from figma-apply.ts at the ~200-line ceiling
 * (Art IX). figma-apply.ts owns the delta walk and the lifecycle (deprecate/un-deprecate);
 * this owns the capture join and the record materialization.
 */
import {
  validateComponentRecord,
  type ComponentRecord,
} from "./registry-store.js";
import type { DeltaEntry } from "./figma-reconcile.js";
import { figmaNodeRelPath, type FigmaNodeSpec } from "./figma-node-reader.js";
import type { MirrorIndex } from "./figma-mirror-capture.js";

/** Why a component in the delta has no captured node spec — always named, never silent. */
export type MirrorSkip = { name: string; reason: string };

/**
 * The captured node spec for one delta entry, or `undefined` + a named reason. Three
 * distinct degrades: no capture pass ran at all (plugin down / a plain CLI apply), the
 * scan failed for this node, or the pass ran but never reached this node.
 */
export function captureFor(
  e: DeltaEntry,
  mirror: MirrorIndex | undefined,
  skipped: MirrorSkip[],
): FigmaNodeSpec | undefined {
  if (mirror === undefined) {
    skipped.push({ name: e.name, reason: "mirror skipped: no capture in this apply (plugin down?)" });
    return undefined;
  }
  const spec = mirror.specs.get(e.nodeId);
  if (spec !== undefined) return spec;
  const failure = mirror.failures.get(e.nodeId);
  skipped.push({
    name: e.name,
    reason: failure !== undefined ? `mirror skipped: scan failed — ${failure}` : "mirror skipped: node not captured",
  });
  return undefined;
}

/**
 * Build the ComponentRecord for a newly captured component. `markup: ""` + empty
 * `tokensUsed` is not a stub — it is the same shape `figma-ds-registry.buildRegistry`
 * writes for every Figma-scanned component (HTML is one-way design→code; the node
 * sidecar carries the real definition). Validated through the shared registry validator
 * so a name the schema rejects surfaces here, not at save time.
 *
 * @throws RegistryError when the Figma node name is not a valid `Category/Variant` key.
 */
export function materialize(e: DeltaEntry): ComponentRecord {
  // Category = the first "/" segment, the same rule figma-ds-registry.categoryOf applies.
  // A name with no "/" is rejected by the validator below before this value is read.
  const slash = e.name.indexOf("/");
  return validateComponentRecord({
    name: e.name,
    category: slash > 0 ? e.name.slice(0, slash).trim() : e.name,
    markup: "",
    tokensUsed: [],
    description: `Figma ${e.nodeType} · mirrored from Figma (spec 005)`,
    scope: e.scope,
    figmaNode: figmaNodeRelPath(e.name),
  });
}
