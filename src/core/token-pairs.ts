/**
 * Paired-token inference (shadcn-standard adoption) — the deterministic key to correct a11y.
 *
 * shadcn's semantic model pairs every surface with its text: `{role}` + `{role}-foreground`
 * (background/foreground, card/card-foreground, primary/primary-foreground, …). Because a
 * foreground token names its ONE intended background, contrast becomes a check on declared
 * pairs — not the text×surface cartesian product that `ds-a11y` used to guess (which mis-paired
 * light-surface text against dark panels: the VSF dogfood "L3" over-pairing bug).
 *
 * Pure, name-based, separator-agnostic (`.`, `-`, `/`). No IO.
 */

/** Trailing `foreground` segment, e.g. "color.primary-foreground" or "color.foreground". */
const FOREGROUND_RE = /^(.+?)[.\-/]foreground$/i;
/** A background/surface sibling under a group, tried in priority order. */
const SURFACE_SUFFIXES = ["background", "bg", "surface", "base"] as const;

/**
 * Infer `[foregroundPath, surfacePath]` pairs from token paths following the
 * `{role}` / `{role}-foreground` convention.
 *
 * - `X-foreground` → its base `X` when that token exists (e.g. primary-foreground → primary).
 * - a bare `…/foreground` whose base is a category (no sibling token) → the app-default pair:
 *   the `background`/`bg`/`surface` token in the same group (e.g. color.foreground → color.background).
 *
 * Only emits a pair when BOTH tokens are present in `paths`.
 */
export function inferForegroundPairs(paths: readonly string[]): [string, string][] {
  const set = new Set(paths);
  const out: [string, string][] = [];
  for (const p of paths) {
    const m = FOREGROUND_RE.exec(p);
    if (m === null) continue;
    const base = m[1] ?? "";
    if (set.has(base)) {
      out.push([p, base]); // {role}-foreground → {role}
      continue;
    }
    // App-default foreground: find a surface sibling in the same group as `base`.
    for (const suffix of SURFACE_SUFFIXES) {
      const dot = `${base}.${suffix}`, dash = `${base}-${suffix}`, slash = `${base}/${suffix}`;
      const hit = set.has(dot) ? dot : set.has(dash) ? dash : set.has(slash) ? slash : null;
      if (hit !== null) { out.push([p, hit]); break; }
    }
  }
  // Stable order: by foreground path then surface path.
  out.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return out;
}

/** True when any token follows the `-foreground` / `…foreground` convention. */
export function hasForegroundTokens(paths: readonly string[]): boolean {
  return paths.some((p) => FOREGROUND_RE.test(p));
}
