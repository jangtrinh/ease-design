// Redundant-family clustering for the DS-hygiene audit (pure — no I/O, no transport).
// Two independent passes over the inventory facts, both feeding one families[] list:
//   (a) axis-values — components whose SOME axis shares a value-set of ≥3 options.
//   (b) name-suffix  — components whose trailing CamelCase token is a known UI-part word.
// Each member component also collects an `info` redundant-family flag naming the signature.
import type { AuditComponentFact } from '../../../shared/audit-types.ts';
import type { AuditFlag, AuditFamily } from './audit-ds-detect.ts';

// Literal list — do NOT widen. These are the UI-part words whose repetition signals a family.
const NAME_SUFFIXES = ['Badge', 'Meter', 'Card', 'Chip', 'Item', 'Row', 'Pill'];

interface Bucket { names: Set<string>; ids: Set<string> }

function bucket(map: Map<string, Bucket>, keyStr: string, c: AuditComponentFact): void {
  const b = map.get(keyStr) ?? { names: new Set<string>(), ids: new Set<string>() };
  b.names.add(c.name);
  b.ids.add(c.id);
  map.set(keyStr, b);
}

export interface FamilyResult {
  families: AuditFamily[];
  /** component id → the redundant-family flags it earned (0, 1 or 2). */
  flaggedById: Map<string, AuditFlag[]>;
}

/** Cluster the inventory into redundant families and the per-member flags they imply. */
export function detectFamilies(comps: AuditComponentFact[]): FamilyResult {
  const families: AuditFamily[] = [];
  const flaggedById = new Map<string, AuditFlag[]>();
  const addFlag = (id: string, flag: AuditFlag): void => {
    const list = flaggedById.get(id) ?? [];
    list.push(flag);
    flaggedById.set(id, list);
  };

  // (a) axis-values: any single axis with ≥3 options contributes a value-set signature;
  //     ≥2 DISTINCT-NAMED components sharing that signature form a family.
  const axisGroups = new Map<string, Bucket>();
  for (const c of comps) {
    for (const values of Object.values(c.variantAxes)) {
      if (values.length < 3) continue;
      const sig = `{${[...values].sort().join(', ')}}`;
      bucket(axisGroups, sig, c);
    }
  }
  for (const [sig, b] of axisGroups) {
    if (b.names.size < 2) continue; // needs ≥2 different names to be "redundant"
    families.push({ signature: sig, reason: 'axis-values', members: [...b.names].sort() });
    for (const id of b.ids) addFlag(id, { id: 'redundant-family', severity: 'info', detail: `redundant-family (axis-values): ${sig}` });
  }

  // (b) name-suffix: the trailing CamelCase token, when it is a known UI-part word;
  //     ≥2 components sharing it form a family.
  const suffixGroups = new Map<string, Bucket>();
  for (const c of comps) {
    const m = c.name.match(/[A-Z][a-z0-9]*$/);
    const token = m ? m[0] : null;
    if (!token || !NAME_SUFFIXES.includes(token)) continue;
    bucket(suffixGroups, token, c);
  }
  for (const [token, b] of suffixGroups) {
    if (b.ids.size < 2) continue;
    families.push({ signature: token, reason: 'name-suffix', members: [...b.names].sort() });
    for (const id of b.ids) addFlag(id, { id: 'redundant-family', severity: 'info', detail: `redundant-family (name-suffix): ${token}` });
  }

  return { families, flaggedById };
}
