/**
 * `tokensUsed` EXISTENCE check (spec 009 P4, owner-correction) — Art IV: fixed at the
 * shared layer registry.ts already imports (ds-reseal.ts's loadDesignSystemForReseal),
 * not invented fresh.
 *
 * `registry-store.ts`'s `TOKEN_PATTERN` only ever checked *format*
 * (`^[a-z][a-z0-9.-]*$`) — a real live run registered `color.this-token-does-not-exist-
 * anywhere` with no refusal (`reports/p4-real-data-gate.md` §3). This module is the
 * existence half: when a sealed DS is present, every `tokensUsed` path must resolve in its
 * compiled tree. Two-level schema (`category.name`), the same convention
 * `ds-change-token-impl.ts` already enforces. Modes live as `$extensions` ON a token, not
 * as tokens of their own, so resolving in the base tree (no mode-branching) is the whole
 * test — a token that exists only under a mode does not exist as a *different* path.
 *
 * A standalone registry (no manifest next to it — e.g. `ingest-figma-ds`'s `--file`
 * target) has no tree to check against: format-only, unchanged, same as before this fix.
 */
import { RegistryError } from "./registry-store.js";
import type { TokenTree } from "./token-model.js";

/** True if `path` (e.g. `"color.primary"`) resolves to a real leaf in `tokens`. */
export function tokenExistsInTree(tokens: TokenTree, path: string): boolean {
  const dot = path.indexOf(".");
  if (dot === -1) return false;
  return tokens[path.slice(0, dot)]?.[path.slice(dot + 1)] !== undefined;
}

/**
 * Refuse the first `tokensUsed` entry that does not resolve in `tokens`. No-op when
 * `tokens` is `undefined` (no DS to check against — format-only, per the module doc).
 * @throws RegistryError("BAD_TOKEN") — message says "does not exist", never "malformed":
 * that failure already surfaced from `TOKEN_PATTERN` before this runs.
 */
export function assertTokensExist(tokensUsed: readonly string[], tokens: TokenTree | undefined): void {
  if (tokens === undefined) return;
  for (const path of tokensUsed) {
    if (!tokenExistsInTree(tokens, path)) {
      throw new RegistryError(
        "BAD_TOKEN",
        `token '${path}' does not exist in the compiled design system — the path is well-formed ` +
          "but unknown, not malformed. Check 'ui ds context --format json' for a real path.",
      );
    }
  }
}
