/**
 * A redirect-only stub: `<meta http-equiv="refresh" content="…url=…">` with effectively no
 * visible body. Such a document has no page to title and no content to voice, so gating it for
 * <title>/<html lang> is noise (dogfood L1: VSF-PCP index.html is a 1-line meta-refresh stub).
 *
 * Shared by a11y-lint (dogfood L1) and validate-layout (dogfood L4) — a redirect-only document
 * is an intentional non-page, so structural/title/lang gating on it is noise. L4's lesson: this
 * detection lives in one shared helper, not a per-linter local fix.
 */
const REFRESH_RE = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*\bcontent\s*=\s*["'][^"']*url=/i;
export function isRedirectStub(html: string): boolean {
  if (!REFRESH_RE.test(html)) return false;
  const bodyText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return bodyText.length < 40; // just the redirect target, no real page copy
}
