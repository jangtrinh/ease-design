// DS-hygiene detectors — PURE: input AuditDsFacts (the plugin's raw scan), output an
// AuditReport. No I/O, no transport, no live Figma — every rule is unit-tested on
// hand-written fixtures; this is where ALL judgment lives (the plugin only gathers facts).
// The nine detectors (unused/junk-name/deprecated/duplicate-name/duplicate-structure/
// redundant-family/empty-set/misfiled/token-violation) are documented inline at each push().
import type { AuditComponentFact, AuditDsFacts } from '../../../shared/audit-types.ts';
import { detectFamilies } from './audit-ds-families.ts';

export interface AuditFlag {
  id: string;
  severity: 'error' | 'warning' | 'info';
  detail: string;
}

export interface AuditedComponent {
  name: string;
  id: string;
  type: string;
  variants: number;
  section: string | null;
  usageCount: number;
  usagePages: string[];
  flags: AuditFlag[];
}

export interface AuditFamily {
  signature: string;
  reason: 'axis-values' | 'name-suffix';
  members: string[];
}

export interface AuditReport {
  /** `skippedPages` non-empty ⇒ usage counts are a lower bound (pages failed to hydrate). */
  file: { fileName: string; pages: string[]; skippedPages: string[] };
  counts: AuditDsFacts['counts'] & { unresolvedUsage: number };
  /** Sorted: maxSeverity desc (error>warning>info), then flags.length desc, then name asc. */
  components: AuditedComponent[];
  families: AuditFamily[];
  summary: {
    total: number;
    unused: number;
    junk: number;
    deprecated: number;
    duplicate: number;
    emptySets: number;
    misfiled: number;
    redundantFamilies: number;
    tokenViolations: number;
  };
}

/** Canonical structure fingerprint: sorted axisName:sortedValues + the child-type signature. */
function structureHash(c: AuditComponentFact): string {
  const axes = Object.keys(c.variantAxes)
    .sort()
    .map((k) => `${k}:${[...c.variantAxes[k]].sort().join(',')}`);
  return JSON.stringify({ axes, sig: c.childTypeSignature });
}

/** Numeric rank of a component's worst flag (error 3 / warning 2 / info 1 / none 0). */
function maxSeverity(flags: AuditFlag[]): number {
  let m = 0;
  for (const f of flags) m = Math.max(m, f.severity === 'error' ? 3 : f.severity === 'warning' ? 2 : 1);
  return m;
}

const JUNK_NAME = /^(component( \d+)?|frame( \d+)?|group( \d+)?)$/i;
const JUNK_AXIS = /^property \d+$/i;
const NUMBERED_SECTION = /^\d{2}\s*[·-]/;

/** Run every detector over the raw facts and produce the sorted, summarized report. */
export function detectAudit(facts: AuditDsFacts): AuditReport {
  const comps = facts.components;
  const skipped = facts.file.skippedPages;
  const scannedPages = facts.file.pages.length - skipped.length;
  const unresolved = facts.usage.unresolved;

  // Cross-component precompute: duplicate-name counts, structure groups, families.
  const nameCount = new Map<string, number>();
  for (const c of comps) {
    const key = c.name.trim();
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }
  const structGroups = new Map<string, number>();
  for (const c of comps) {
    const h = structureHash(c);
    structGroups.set(h, (structGroups.get(h) ?? 0) + 1);
  }
  const { families, flaggedById } = detectFamilies(comps);

  const audited: AuditedComponent[] = comps.map((c) => {
    const flags: AuditFlag[] = [];
    const usageCount = facts.usage.byMainId[c.id] ?? 0;
    const usagePages = facts.usage.pagesById[c.id] ?? [];
    const trimmed = c.name.trim();

    // unused
    if (usageCount === 0) {
      let detail = `0 instances across ${scannedPages} scanned pages`;
      if (unresolved > 0) detail += ` (usage scan had ${unresolved} unresolved instances — verify before delete)`;
      if (skipped.length > 0) detail += ` (${skipped.length} page(s) failed to load — usage is a lower bound)`;
      flags.push({ id: 'unused', severity: 'warning', detail });
    }
    // junk-name
    const axisNames = Object.keys(c.variantAxes);
    const junkName = JUNK_NAME.test(trimmed);
    const junkAxes = axisNames.length > 0 && axisNames.every((a) => JUNK_AXIS.test(a));
    if (junkName || junkAxes) {
      flags.push({
        id: 'junk-name',
        severity: 'error',
        detail: junkName ? `generic node name "${c.name}"` : 'every variant axis is unnamed ("Property N")',
      });
    }
    // deprecated
    if (/\[deprecated\]/i.test(c.name) || c.deprecatedData) {
      flags.push({
        id: 'deprecated',
        severity: 'error',
        detail: c.deprecatedData ? 'marked deprecated (plugin data idp/status)' : 'name tagged [deprecated]',
      });
    }
    // duplicate-name
    const dupNameN = nameCount.get(trimmed) ?? 0;
    const isDupName = dupNameN >= 2;
    if (isDupName) {
      flags.push({ id: 'duplicate-name', severity: 'error', detail: `name "${trimmed}" shared by ${dupNameN} components` });
    } else if ((structGroups.get(structureHash(c)) ?? 0) >= 2) {
      // duplicate-structure — only when NOT already duplicate-name (no double-flag).
      const others = (structGroups.get(structureHash(c)) ?? 1) - 1;
      flags.push({ id: 'duplicate-structure', severity: 'warning', detail: `identical structure to ${others} other component(s)` });
    }
    // redundant-family (precomputed)
    for (const f of flaggedById.get(c.id) ?? []) flags.push(f);
    // empty-set
    if (c.type === 'COMPONENT_SET' && c.variantCount <= 1) {
      flags.push({ id: 'empty-set', severity: 'warning', detail: `component set with ${c.variantCount} variant(s)` });
    }
    // misfiled
    if (c.section === null || !NUMBERED_SECTION.test(c.section)) {
      flags.push({
        id: 'misfiled',
        severity: 'info',
        detail: c.section === null ? 'outside every section' : `section "${c.section}" is not a numbered DS section`,
      });
    }
    // token-violation
    if (c.unboundFills + c.unboundStrokes > 0) {
      const parts: string[] = [];
      if (c.unboundFills > 0) parts.push(`${c.unboundFills} fills`);
      if (c.unboundStrokes > 0) parts.push(`${c.unboundStrokes} strokes`);
      flags.push({ id: 'token-violation', severity: 'warning', detail: `${parts.join(', ')} not bound to variables` });
    }

    return {
      name: c.name,
      id: c.id,
      type: c.type,
      variants: c.variantCount,
      section: c.section,
      usageCount,
      usagePages,
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

  const has = (c: AuditedComponent, id: string): boolean => c.flags.some((f) => f.id === id);
  const count = (id: string): number => audited.filter((c) => has(c, id)).length;
  const summary = {
    total: audited.length,
    unused: count('unused'),
    junk: count('junk-name'),
    deprecated: count('deprecated'),
    duplicate: audited.filter((c) => has(c, 'duplicate-name') || has(c, 'duplicate-structure')).length,
    emptySets: count('empty-set'),
    misfiled: count('misfiled'),
    redundantFamilies: families.length,
    tokenViolations: count('token-violation'),
  };

  return {
    file: {
      fileName: facts.file.fileName,
      pages: facts.file.pages.map((p) => p.name),
      skippedPages: skipped,
    },
    counts: { ...facts.counts, unresolvedUsage: unresolved },
    components: audited,
    families,
    summary,
  };
}
