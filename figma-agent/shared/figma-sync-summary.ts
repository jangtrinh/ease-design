// Honest sync summary (spec 005 P4) — the ONE place that turns a kernel apply report
// into the sentence the panel shows.
//
// Why it exists: spec 004 shipped a panel that said "Synced ✓" off the raw event count,
// so 21 canvas changes that landed NOTHING in the registry still read as a success. This
// module only ever counts records the kernel actually changed (added/updated/deprecated)
// plus components whose node sidecar was mirrored — never log events (Art VIII).
//
// Lives in shared/ because both sides need the same words: the broker builds the summary
// from the `ui figma reconcile --apply --json` envelope, and the panel renders it. Two
// bundles, one source of truth for the claim.

/** Counts taken from the kernel's `data.apply` report. */
export interface AppliedCounts {
  added: number;
  updated: number;
  deprecated: number;
  mirrored: number;
  pending: number;
  skipped: number;
  /** Components the mirror could not capture (plugin down / scan failed). */
  mirrorSkipped: number;
}

export function emptyCounts(): AppliedCounts {
  return { added: 0, updated: 0, deprecated: 0, mirrored: 0, pending: 0, skipped: 0, mirrorSkipped: 0 };
}

/** Records the apply actually changed. `false` ⇒ the panel must NOT claim a sync landed. */
export function landed(c: AppliedCounts): number {
  return c.added + c.updated + c.deprecated;
}

/** Length of an array-valued field, or 0 — the envelope crosses a process boundary untyped. */
function len(report: Record<string, unknown> | undefined, key: string): number {
  const v = report?.[key];
  return Array.isArray(v) ? v.length : 0;
}

/** Read the counts out of a `data.apply` report defensively (any shape → valid counts). */
export function countsFromApplyReport(apply: unknown): AppliedCounts {
  const r =
    apply !== null && typeof apply === 'object' && !Array.isArray(apply)
      ? (apply as Record<string, unknown>)
      : undefined;
  return {
    added: len(r, 'added'),
    updated: len(r, 'updated'),
    deprecated: len(r, 'deprecated'),
    mirrored: len(r, 'mirrored'),
    pending: len(r, 'pending'),
    skipped: len(r, 'skipped'),
    mirrorSkipped: len(r, 'mirrorSkipped'),
  };
}

/**
 * One honest line for what the apply did: "1 added, 3 mirrored, 1 deprecated".
 *
 * Only non-zero parts appear. When nothing landed the sentence says so and names what is
 * waiting instead — "nothing landed — 21 pending re-ingest" — because a count of pending
 * work is not a count of synced work. A degraded mirror is always appended, so a
 * plugin-down apply can never look complete.
 */
export function syncSummary(c: AppliedCounts): string {
  const parts: string[] = [];
  const push = (n: number, word: string): void => { if (n > 0) parts.push(`${n} ${word}`); };
  push(c.added, 'added');
  push(c.updated, 'updated');
  push(c.deprecated, 'deprecated');
  push(c.mirrored, 'mirrored');

  const tail: string[] = [];
  if (c.pending > 0) tail.push(`${c.pending} pending re-ingest`);
  if (c.mirrorSkipped > 0) tail.push(`${c.mirrorSkipped} not mirrored`);

  if (parts.length === 0) {
    return tail.length > 0 ? `nothing landed — ${tail.join(', ')}` : 'nothing to sync';
  }
  return tail.length > 0 ? `${parts.join(', ')} (${tail.join(', ')})` : parts.join(', ');
}
