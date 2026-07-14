// Structural analysis for the DS-hygiene audit (pure — no I/O, no transport, no live Figma;
// node:crypto sha1 for content hashing is allowed here, CLI-side). Three jobs:
//   - classifyAll: split every master into ds / icon / screen (the v1 "inflation" fix — the
//     1469 vector-only icon masters + full-screen frames must NOT drown the real DS masters).
//   - unitHash + comparable: content fingerprint of a unit, and whether it is DISTINCTIVE
//     enough to compare (a bare vector/skeleton with default layer names is not — that class
//     of false-positive produced v1's 1560 "duplicate" count).
//   - detectStructure: within-set + cross-master structural duplicates, and dead variants.
import { createHash } from 'node:crypto';
import type { AuditComponentFact, AuditUnitFact } from '../../../shared/audit-types.ts';
import type { AuditFlag } from './audit-ds-detect.ts';
import { normalizeName } from './audit-ds-families.ts';

export type MasterKind = 'ds' | 'icon' | 'screen';

// A master this wide AND tall is a screen/artboard, not a library component (named consts, not flags).
const SCREEN_MIN_W = 1000;
const SCREEN_MIN_H = 700;
// Node types that can appear in a pure-vector icon (no TEXT, no INSTANCE).
const VECTORISH = new Set([
  'COMPONENT', 'FRAME', 'GROUP', 'VECTOR', 'BOOLEAN_OPERATION',
  'ELLIPSE', 'RECTANGLE', 'LINE', 'POLYGON', 'STAR',
]);
// Figma's auto-assigned layer names — their presence means the structure is NOT intentional signal.
const DEFAULT_LAYER = /^(vector|ellipse|rectangle|line|polygon|star|boolean.*|group|frame|component|union|subtract|intersect|exclude)( \d+)?$/i;

/** A cross-master structural-duplicate group, handed to the family pass (variant-structure). */
export interface CrossMasterGroup {
  hash: string;
  /** DISTINCT raw master names in the group (post-tombstone-skip ⇒ ≥2 distinct normalized names). */
  masters: string[];
  /** texts of a representative unit — feeds the family signature. */
  texts: string[];
}

export interface StructureFindings {
  /** master id → its duplicate-structure and/or dead-variants flags. */
  flagsById: Map<string, AuditFlag[]>;
  crossMasterGroups: CrossMasterGroup[];
  /** master id → dead-variant COUNT (summary needs the Σ, not the master count). */
  deadCountById: Map<string, number>;
}

/** Parse a structure entry `${depth}:${type}:${name}:${w}x${h}` (name may contain ':').
 *  Non-entry markers like '…capped' get depth −1 + type=themselves so they never read as vectorish. */
function parseEntry(entry: string): { depth: number; type: string; name: string } {
  const first = entry.indexOf(':');
  if (first < 0) return { depth: -1, type: entry, name: entry };
  const second = entry.indexOf(':', first + 1);
  const last = entry.lastIndexOf(':');
  if (second < 0) return { depth: -1, type: entry.slice(first + 1), name: '' };
  const depth = Number(entry.slice(0, first));
  return {
    depth: Number.isFinite(depth) ? depth : -1,
    type: entry.slice(first + 1, second),
    name: entry.slice(second + 1, last),
  };
}

// A vector-only master is an ICON only when it belongs to a big same-prefix family (an icon
// LIBRARY is imported in bulk under one naming prefix — VSF: 'Icon / *' ×1469). A lone
// vector-only master is a real DS primitive (live VSF finding: Separator, Switch, StatusDot,
// ProgressBar, Logo… are text-free by design and must NOT lose their detector coverage).
const MIN_ICON_FAMILY = 20;

/** The grouping prefix for icon-family detection: text before the first '/', '' when none.
 *  ('' groups flat-named libraries too — a file whose 25 assorted no-slash primitives are all
 *  vector-only would over-group; accepted v2 trade-off, revisit on a real file that hits it.) */
function iconPrefix(name: string): string {
  const i = name.indexOf('/');
  return i < 0 ? '' : name.slice(0, i).trim();
}

/** EVERY unit text-free and made only of vector-ish node types (units.length>0 guard:
 *  a master with no units is never "vector-only" — the vacuous-true trap). */
function vectorOnly(c: AuditComponentFact): boolean {
  return c.units.length > 0 && c.units.every(
    (u) => u.texts.length === 0 && u.structure.every((e) => VECTORISH.has(parseEntry(e).type)),
  );
}

/** ds / icon / screen for EVERY master in one pass (icon needs cross-master context: the
 *  same-prefix family size). Screen wins first, on viewport SIZE only — intrinsic; deliberately
 *  NOT section-name-based: on the real VSF file a section literally named 'Screen' held true DS
 *  masters (Component 208 uses, Table status 151…) — a section name is user taxonomy (misfiled
 *  territory), not an intrinsic property. */
export function classifyAll(masters: AuditComponentFact[]): Map<string, MasterKind> {
  const kinds = new Map<string, MasterKind>();
  const vectorCandidates: { id: string; prefix: string }[] = [];
  for (const c of masters) {
    if (c.width >= SCREEN_MIN_W && c.height >= SCREEN_MIN_H) kinds.set(c.id, 'screen');
    else if (vectorOnly(c)) vectorCandidates.push({ id: c.id, prefix: iconPrefix(c.name) });
    else kinds.set(c.id, 'ds');
  }
  const familySize = new Map<string, number>();
  for (const v of vectorCandidates) familySize.set(v.prefix, (familySize.get(v.prefix) ?? 0) + 1);
  for (const v of vectorCandidates) {
    kinds.set(v.id, (familySize.get(v.prefix) ?? 0) >= MIN_ICON_FAMILY ? 'icon' : 'ds');
  }
  return kinds;
}

/** Content fingerprint of a unit — structure + texts + paints only (names/ids excluded). */
export function unitHash(u: AuditUnitFact): string {
  return createHash('sha1')
    .update(JSON.stringify({ structure: u.structure, texts: u.texts, paints: u.paints }))
    .digest('hex')
    .slice(0, 12);
}

/** Is a unit DISTINCTIVE enough to compare? Text, an instance, or ANY custom (non-default)
 *  layer name qualifies; a bare vector skeleton with only auto-names does NOT (kills the
 *  icon/skeleton mega-cluster of false positives for good). Root entry (depth 0) is ignored. */
export function comparable(u: AuditUnitFact): boolean {
  if (u.texts.length > 0) return true;
  for (const e of u.structure) {
    const { depth, type, name } = parseEntry(e);
    if (type === 'INSTANCE') return true;
    if (depth !== 0 && name !== '' && !DEFAULT_LAYER.test(name)) return true;
  }
  return false;
}

/** Push a flag into a per-id list (created on first use). */
function addFlag(map: Map<string, AuditFlag[]>, id: string, flag: AuditFlag): void {
  const list = map.get(id) ?? [];
  list.push(flag);
  map.set(id, list);
}

interface OwnedUnit { unit: AuditUnitFact; masterId: string; masterName: string }

/**
 * Structural duplicates + dead variants over the ds masters only.
 * `usageByMainId` is the census (byMainId): a SET is "used" iff its census count > 0 — dead
 * variants only make sense for a set the doc actually uses.
 */
export function detectStructure(
  dsMasters: AuditComponentFact[],
  usageByMainId: Record<string, number>,
): StructureFindings {
  const flagsById = new Map<string, AuditFlag[]>();
  const crossMasterGroups: CrossMasterGroup[] = [];
  const deadCountById = new Map<string, number>();

  // Group every COMPARABLE unit across every ds master by content hash.
  const groups = new Map<string, OwnedUnit[]>();
  for (const m of dsMasters) {
    for (const u of m.units) {
      if (!comparable(u)) continue;
      const owned: OwnedUnit = { unit: u, masterId: m.id, masterName: m.name };
      const g = groups.get(unitHash(u));
      if (g) g.push(owned);
      else groups.set(unitHash(u), [owned]);
    }
  }

  for (const [hash, owned] of groups) {
    if (owned.length < 2) continue;
    const masterIds = new Set(owned.map((o) => o.masterId));

    if (masterIds.size === 1) {
      // Within-set: N identical variants inside ONE set → one flag on that master.
      const names = owned.map((o) => o.unit.name);
      addFlag(flagsById, owned[0].masterId, {
        id: 'duplicate-structure', severity: 'warning',
        detail: `${owned.length} identical variants inside this set: ${names.join(', ')}`,
      });
      continue;
    }

    // Spanning ≥2 masters. Tombstone pair (all owners share ONE normalized name) is
    // duplicate-name territory, not structure — skip flagging AND collecting.
    const normNames = new Set(owned.map((o) => normalizeName(o.masterName)));
    if (normNames.size === 1) continue;

    // One flag per involved master, naming ANOTHER master's matching unit.
    const firstPerMaster = new Map<string, OwnedUnit>();
    for (const o of owned) if (!firstPerMaster.has(o.masterId)) firstPerMaster.set(o.masterId, o);
    const reps = [...firstPerMaster.values()];
    for (const o of reps) {
      const others = reps.filter((x) => x.masterId !== o.masterId);
      const more = others.length - 1;
      const suffix = more > 0 ? ` +${more} more` : '';
      addFlag(flagsById, o.masterId, {
        id: 'duplicate-structure', severity: 'warning',
        detail: `variant/unit structurally identical to ${others[0].masterName}("${others[0].unit.name}")${suffix}`,
      });
    }
    crossMasterGroups.push({
      hash,
      masters: [...new Set(owned.map((o) => o.masterName))].sort(),
      texts: owned[0].unit.texts,
    });
  }

  // Dead variants: a ds SET the census says is USED, but with variant children that have 0
  // doc-wide instances (strict: usageCount null = "unknown", never counted dead).
  for (const m of dsMasters) {
    if (m.type !== 'COMPONENT_SET') continue;
    if ((usageByMainId[m.id] ?? 0) <= 0) continue; // unused set → the whole set is the "unused" flag's job
    const dead = m.units.filter((u) => u.usageCount === 0);
    if (dead.length === 0) continue;
    deadCountById.set(m.id, dead.length);
    addFlag(flagsById, m.id, {
      id: 'dead-variants', severity: 'warning',
      detail: `${dead.length} of ${m.units.length} variants have 0 doc-wide instances: ${dead.map((u) => u.name).join(', ')}`,
    });
  }

  return { flagsById, crossMasterGroups, deadCountById };
}
