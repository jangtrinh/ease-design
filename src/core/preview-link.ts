/**
 * Preview-link convention (spec 019 Phase 2) — the OSC-8-safe way commands point a
 * user at a generated file. No network, no path resolution here: callers pass an
 * already-resolved absolute path (`path.resolve`).
 *
 * Rationale (locked, see specs/019-onboarding-first-run/overview.md): a bare
 * `file://<abs>` / `https://<url>` is what the host terminal wraps in an OSC 8
 * clickable link. `[label](url)` markdown-link syntax is discarded by Claude Code's
 * channel-B renderer — never emit it. Never emit an inline image either.
 */
import { pathToFileURL } from "node:url";
import { kv } from "./report-style.js";

/**
 * A single labelled `kv` line whose value is a bare `file://` URL — never
 * `[label](url)`, never an image. `absPath` must already be absolute;
 * `pathToFileURL` percent-encodes spaces, `#`, `%`, `?` so a path like
 * `design preview/a b.html` yields a valid, host-clickable URL.
 */
export function previewLink(absPath: string, label = "preview"): string {
  return kv(label, pathToFileURL(absPath).href);
}

/**
 * The honest one-liner for commands that would otherwise want to show a Figma
 * preview link: Figma URLs are produced by the figma-agent layer, not the `ui`
 * kernel (Art I — no network in the kernel).
 */
export function figmaNote(): string {
  return kv("figma", "(via figma-agent; ui does not construct Figma URLs)");
}
