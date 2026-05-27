/**
 * URL → kebab-case slug derivation for `/ui:from-url` folder output.
 *
 * Rule: when no override is supplied, parse the URL, take the hostname,
 * strip a leading "www.", and replace dots and slashes with dashes.
 * Lowercased throughout.
 *
 * Examples:
 *   https://www.traicaybentre.com/   → traicaybentre-com
 *   https://nextjs.org/docs          → nextjs-org
 *   https://stripe.com               → stripe-com
 *
 * Override path: caller supplies `name`. The name must match the
 * kebab-case shape (lowercase alphanumerics, single dashes between
 * groups, no leading/trailing dash). Otherwise we throw SlugError.
 */

const KEBAB_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export class SlugError extends Error {
  constructor(public code: "BAD_URL" | "BAD_NAME", message: string) {
    super(message);
    this.name = "SlugError";
  }
}

/**
 * Derive the per-project folder slug for a URL, with optional override.
 *
 * @throws SlugError on malformed input.
 */
export function deriveSlug(url: string, override?: string): string {
  if (override !== undefined) {
    if (typeof override !== "string" || override.length === 0) {
      throw new SlugError("BAD_NAME", "override name must be a non-empty string");
    }
    if (override.length > 64) {
      throw new SlugError("BAD_NAME", `override name too long (max 64 chars): '${override}'`);
    }
    if (!KEBAB_RE.test(override)) {
      throw new SlugError("BAD_NAME", `override name must be kebab-case (a-z, 0-9, single dashes): '${override}'`);
    }
    return override;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SlugError("BAD_URL", `invalid URL: '${url}'`);
  }

  let host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    throw new SlugError("BAD_URL", `URL has no hostname: '${url}'`);
  }

  if (host.startsWith("www.")) {
    host = host.slice(4);
  }

  const slug = host.replace(/[./]/g, "-");

  if (!KEBAB_RE.test(slug)) {
    throw new SlugError("BAD_URL", `derived slug is not kebab-case: '${slug}' (from '${url}')`);
  }

  return slug;
}
