// DS-hygiene detectors — PURE: input AuditDsFacts (the plugin's raw scan), output an
// AuditReport. No I/O, no transport, no live Figma — every rule is unit-tested on
// hand-written fixtures; this is where ALL judgment lives (the plugin only gathers facts).
//
// v2 first SEGMENTS every master into ds / icon / screen (classifyAll) — the real fix for
// v1's inflation (1469 vector icons + screen frames drowned ~120 DS masters). Only ds masters
// run the ten detectors below; icons/screens are summarised separately in `segments`.
// The ten detectors (unused / junk-name / deprecated / duplicate-name / duplicate-structure /
// dead-variants / empty-set / misfiled / token-violation / redundant-family) are documented
// inline at each push().
import type { AuditComponentFact, AuditDsFacts } from '../../../shared/audit-types.ts';
import { detectFamilies } from './audit-ds-families.ts';
import { classifyAll, detectStructure, type MasterKind } from './audit-ds-structure.ts';

export interface AuditFlag {
  id: string;
  severity: 'error' | 'warning' | 'info';
  detail: string;
}

/** One variant child of a set, as surfaced in the report (axisValues parsed CLI-side). */
export interface AuditedVariant {
  id: string;
  name: string;
  axisValues: Record<string, string>;
  usageCount: number | null;
}

export interface AuditedComponent {
  name: string;
  id: string;
  type: string;
  kind: MasterKind;
  variantCount: number;
  section: string | null;
  pageName: string;
  usageCount: number;
  usagePages: string[];
  /** [] for a standalone COMPONENT; one entry per variant child for a SET. */
  variants: AuditedVariant[];
  flags: AuditFlag[];
}

export interface AuditFamily {
  signature: string;
  reason: 'axis-values' | 'name-suffix' | 'variant-structure';
  members: string[];
}

export interface AuditReport {
  /** `skippedPages` non-empty ⇒ usage counts are a lower bound (pages failed to hydrate). */
  file: { fileName: string; pages: string[]; skippedPages: string[] };
  /** masters/sets/standalone/variants/instancesTallied pass through the raw scan;
   *  icons/screens come from segmentation; unresolvedUsage from the census. */
  counts: {
    masters: number; sets: number; standalone: number; icons: number; screens: number;
    variants: number; instancesTallied: number; unresolvedUsage: number;
  };
  /** ds masters ONLY. Sorted: maxSeverity desc (error>warning>info), then flags.length desc, then name asc. */
  components: AuditedComponent[];
  families: AuditFamily[];
  /** The two non-ds segments, reported (not detector-flagged) so the ds numbers stay honest. */
  segments: {
    icons: { total: number; used: number; unused: number; unusedNames: string[] };
    screens: { total: number; names: string[] };
  };
  summary: {
    total: number;
    unused: number;
    junk: number;
    deprecated: number;
    duplicateName: number;
    duplicateStructure: number;
    /** Σ dead-variant COUNT across masters (NOT the number of masters with dead variants). */
    deadVariants: number;
    emptySets: number;
    misfiled: number;
    redundantFamilies: number;
    tokenViolations: number;
  };
}

/** Detector configuration. `sections`: the configured DS taxonomy — misfiled fires ONLY when set. */
export interface DetectOpts { sections?: string[] }

/** Numeric rank of a component's worst flag (error 3 / warning 2 / info 1 / none 0). */
function maxSeverity(flags: AuditFlag[]): number {
  let m = 0;
  for (const f of flags) m = Math.max(m, f.severity === 'error' ? 3 : f.severity === 'warning' ? 2 : 1);
  return m;
}

const JUNK_NAME = /^(component( \d+)?|frame( \d+)?|group( \d+)?)$/i;
const JUNK_AXIS = /^property \d+$/i;

/** Parse a variant child name "A=1, B=2" → {A:'1', B:'2'}; nameless/axis-free names → {}. */
function parseAxisValues(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!name) return out;
  for (const part of name.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k) out[k] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Run every detector over the raw facts and produce the sorted, summarized report. */
export function detectAudit(facts: AuditDsFacts, opts: DetectOpts = {}): AuditReport {
  const skipped = facts.file.skippedPages;
  const scannedPages = facts.file.pages.length - skipped.length;
  const unresolved = facts.usage.unresolved;
  const byMainId = facts.usage.byMainId;
  const configuredSections = opts.sections?.length ? opts.sections : null;

  // ── Segment: ds masters run the detectors; icons/screens are summarised only. ──
  const dsMasters: AuditComponentFact[] = [];
  const iconMasters: AuditComponentFact[] = [];
  const screenMasters: AuditComponentFact[] = [];
  const kindById: Map<string, MasterKind> = classifyAll(facts.components);
  for (const c of facts.components) {
    const kind = kindById.get(c.id) ?? 'ds';
    (kind === 'ds' ? dsMasters : kind === 'icon' ? iconMasters : screenMasters).push(c);
  }

  // Cross-master precompute over ds masters: duplicate-name counts, structure, families.
  const nameCount = new Map<string, number>();
  for (const c of dsMasters) {
    const key = c.name.trim();
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }
  const structure = detectStructure(dsMasters, byMainId);
  const { families, flaggedById } = detectFamilies(dsMasters, structure.crossMasterGroups);

  const audited: AuditedComponent[] = dsMasters.map((c) => {
    const flags: AuditFlag[] = [];
    const usageCount = byMainId[c.id] ?? 0;
    const usagePages = facts.usage.pagesById[c.id] ?? [];
    const trimmed = c.name.trim();

    // 1. unused — census 0. Hedges: unresolved instances, skipped pages, and (NEW) a set whose
    //    variant getInstancesAsync counts are non-zero even though the census tally missed it.
    if (usageCount === 0) {
      let detail = `0 instances across ${scannedPages} scanned pages`;
      if (unresolved > 0) detail += ` (usage scan had ${unresolved} unresolved instances — verify before delete)`;
      if (skipped.length > 0) detail += ` (${skipped.length} page(s) failed to load — usage is a lower bound)`;
      const variantUsage = c.units.reduce((s, u) => s + (u.usageCount ?? 0), 0);
      if (variantUsage > 0) detail += ` (variants show ${variantUsage} doc-wide instances — verify before delete)`;
      flags.push({ id: 'unused', severity: 'warning', detail });
    }
    // 2. junk-name — generic node name, or every variant axis unnamed ("Property N").
    const axisNames = Object.keys(c.variantAxes);
    const junkName = JUNK_NAME.test(trimmed);
    const junkAxes = axisNames.length > 0 && axisNames.every((a) => JUNK_AXIS.test(a));
    if (junkName || junkAxes) {
      flags.push({
        id: 'junk-name', severity: 'error',
        detail: junkName ? `generic node name "${c.name}"` : 'every variant axis is unnamed ("Property N")',
      });
    }
    // 3. deprecated — [deprecated] name tag or the idp/status plugin datum.
    if (/\[deprecated\]/i.test(c.name) || c.deprecatedData) {
      flags.push({
        id: 'deprecated', severity: 'error',
        detail: c.deprecatedData ? 'marked deprecated (plugin data idp/status)' : 'name tagged [deprecated]',
      });
    }
    // 4. duplicate-name — exact trimmed-name collisions among ds masters (raw names; the ❌
    //    tombstone split is user-accepted point-in-time semantics — see plan §8).
    const dupNameN = nameCount.get(trimmed) ?? 0;
    const isDupName = dupNameN >= 2;
    if (isDupName) {
      flags.push({ id: 'duplicate-name', severity: 'error', detail: `name "${trimmed}" shared by ${dupNameN} components` });
    }
    // 5. duplicate-structure + dead-variants — from detectStructure. duplicate-structure is
    //    SUPPRESSED on a master already flagged duplicate-name (no double-flag; v1 rule kept).
    for (const f of structure.flagsById.get(c.id) ?? []) {
      if (f.id === 'duplicate-structure' && isDupName) continue;
      flags.push(f);
    }
    // 6. empty-set — a COMPONENT_SET with ≤1 variant.
    if (c.type === 'COMPONENT_SET' && c.variantCount <= 1) {
      flags.push({ id: 'empty-set', severity: 'warning', detail: `component set with ${c.variantCount} variant(s)` });
    }
    // 7. misfiled — ONLY when a section taxonomy is configured; no config ⇒ zero flags.
    if (configuredSections) {
      if (c.section === null) {
        flags.push({ id: 'misfiled', severity: 'info', detail: 'outside every section' });
      } else if (!configuredSections.includes(c.section)) {
        flags.push({ id: 'misfiled', severity: 'info', detail: `section "${c.section}" is not in the configured taxonomy` });
      }
    }
    // 8. token-violation — unbound SOLID paints on the representative + its direct children.
    if (c.unboundFills + c.unboundStrokes > 0) {
      const parts: string[] = [];
      if (c.unboundFills > 0) parts.push(`${c.unboundFills} fills`);
      if (c.unboundStrokes > 0) parts.push(`${c.unboundStrokes} strokes`);
      flags.push({ id: 'token-violation', severity: 'warning', detail: `${parts.join(', ')} not bound to variables` });
    }
    // 9. redundant-family (precomputed for passes a/b).
    for (const f of flaggedById.get(c.id) ?? []) flags.push(f);

    return {
      name: c.name,
      id: c.id,
      type: c.type,
      kind: kindById.get(c.id) ?? 'ds',
      variantCount: c.variantCount,
      section: c.section,
      pageName: c.pageName,
      usageCount,
      usagePages,
      variants: c.type === 'COMPONENT_SET'
        ? c.units.map((u) => ({ id: u.id, name: u.name, axisValues: parseAxisValues(u.name), usageCount: u.usageCount }))
        : [],
      flags,
    };
  });

  // Sort: worst-severity first, then most flags, then name — deterministic for a stable report.
  audited.sort((a, b) => {
    const bySeverity = maxSeverity(b.flags) - maxSeverity(a.flags);
    if (bySeverity !== 0) return bySeverity;
    const byCount = b.flags.length - a.flags.length;
    if (byCount !== 0) return byCount;
    return a.name.localeCompare(b.name);
  });

  const count = (id: string): number => audited.filter((c) => c.flags.some((f) => f.id === id)).length;
  let deadVariants = 0;
  for (const n of structure.deadCountById.values()) deadVariants += n;

  const iconUnused = iconMasters.filter((c) => (byMainId[c.id] ?? 0) === 0);
  return {
    file: {
      fileName: facts.file.fileName,
      pages: facts.file.pages.map((p) => p.name),
      skippedPages: skipped,
    },
    counts: {
      masters: facts.counts.masters,
      sets: facts.counts.sets,
      standalone: facts.counts.standalone,
      icons: iconMasters.length,
      screens: screenMasters.length,
      variants: facts.counts.variants,
      instancesTallied: facts.counts.instancesTallied,
      unresolvedUsage: unresolved,
    },
    components: audited,
    families,
    segments: {
      icons: {
        total: iconMasters.length,
        used: iconMasters.length - iconUnused.length,
        unused: iconUnused.length,
        unusedNames: iconUnused.map((c) => c.name).sort(),
      },
      screens: {
        total: screenMasters.length,
        names: screenMasters.map((c) => c.name).sort(),
      },
    },
    summary: {
      total: audited.length, // ds masters only
      unused: count('unused'),
      junk: count('junk-name'),
      deprecated: count('deprecated'),
      duplicateName: count('duplicate-name'),
      duplicateStructure: count('duplicate-structure'),
      deadVariants, // Σ dead-variant COUNT, not the master count
      emptySets: count('empty-set'),
      misfiled: count('misfiled'),
      redundantFamilies: families.length,
      tokenViolations: count('token-violation'),
    },
  };
}
