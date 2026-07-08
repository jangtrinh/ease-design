/**
 * Flag guard — reject unknown / misspelled CLI flags instead of silently
 * swallowing them.
 *
 * The hand-rolled parser (cli-args.ts) is intentionally lenient: an unrecognised
 * `--brand-color #fff` is captured as `flags["brand-color"]` and otherwise
 * ignored, so a command like `ui ds init acme --brand-color #fff` used to drop
 * the intended brand seed and still exit 0. That silent misconfiguration is
 * exactly the failure mode a machine caller (the host model, forming an
 * invocation from prose) is most likely to hit.
 *
 * A (sub)command opts in by declaring the long-flag names it accepts and calling
 * `findUnknownFlag(parsed.flags, KNOWN)` up front. Global flags (`--help`,
 * `--version`, `--json`) are always allowed. Zero dependencies, pure transform.
 */

/** Flags accepted by every command regardless of its own flag set. */
const GLOBAL_FLAGS = ["help", "version", "json"] as const;

/**
 * Suggest the nearest flag when it is plausibly a typo. The bound scales with
 * the flag's length so a long, obviously-intended miss still matches
 * (`--brand-color` → `--brand-hex` is 5 edits) while unrelated noise is rejected.
 */
function suggestionThreshold(key: string): number {
  return Math.max(2, Math.floor(key.length / 2));
}

export interface UnknownFlag {
  /** The offending flag key, without leading dashes. */
  flag: string;
  /** The nearest declared flag (no dashes), when close enough to be a likely typo. */
  suggestion?: string;
}

/**
 * Levenshtein edit distance between two strings (iterative single-row DP).
 * Used to turn `--brand-color` into a "did you mean --brand-hex?" hint.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j] ?? 0) + 1, // deletion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/**
 * Return the first flag present in `flags` that is neither a global flag nor a
 * member of `knownFlags`, or `null` when every flag is recognised.
 *
 * `knownFlags` are the long-flag names (no leading dashes) the calling
 * (sub)command accepts. Iterates keys in parse order so the result is
 * deterministic for a fixed argv.
 */
export function findUnknownFlag(
  flags: Record<string, string | boolean>,
  knownFlags: readonly string[],
): UnknownFlag | null {
  const allowed = new Set<string>([...GLOBAL_FLAGS, ...knownFlags]);
  for (const key of Object.keys(flags)) {
    if (allowed.has(key)) continue;

    // Offer the closest declared flag as a typo hint, when plausibly close.
    let best: string | undefined;
    let bestDist = Infinity;
    for (const known of knownFlags) {
      const d = levenshtein(key, known);
      if (d < bestDist) {
        bestDist = d;
        best = known;
      }
    }
    const suggestion =
      best !== undefined && bestDist <= suggestionThreshold(key) ? best : undefined;
    return suggestion !== undefined ? { flag: key, suggestion } : { flag: key };
  }
  return null;
}

/** Build the user-facing UNKNOWN_FLAG message for a detected unknown flag. */
export function unknownFlagMessage(u: UnknownFlag): string {
  const hint = u.suggestion !== undefined ? ` (did you mean '--${u.suggestion}'?)` : "";
  return `unknown flag '--${u.flag}'${hint}. Run with -h to see accepted flags.`;
}
