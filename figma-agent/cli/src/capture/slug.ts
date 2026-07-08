// Deterministic URL → folder-slug resolution for the unified per-URL capture
// folder (<slug>/capture/). Pure + node:path only, so slugifyUrl is
// unit-testable. Track 5 Commit 3.
import { join } from 'node:path';

/** kebab-case slug of a URL's domain (+ path). Stable, filesystem-safe, ≤80 chars. */
export function slugifyUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    try { u = new URL(`https://${rawUrl}`); } catch { return 'site'; }
  }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
  const combined = path ? `${host}-${path}` : host;
  const slug = combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'site';
}

/** Absolute path of the capture subfolder: <baseDir>/<slug>/capture. */
export function resolveCaptureDir(baseDir: string, url: string): string {
  return join(baseDir, slugifyUrl(url), 'capture');
}
