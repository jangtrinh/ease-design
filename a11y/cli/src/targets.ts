/**
 * Target resolution — pure, browser-free (so it can be unit-tested without launching Chrome).
 *
 * A target is either an already-schemed URL (http/https/file) passed through untouched, or a
 * local filesystem path resolved to an absolute `file://` URL Chrome can open.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** A URL already carries a scheme (http/https/file); a bare path becomes an absolute `file://` URL. */
export function toUrl(target: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : pathToFileURL(resolve(target)).href;
}
