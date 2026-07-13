/**
 * Probe (once) for installed Google Chrome — what Playwright `channel: "chrome"` needs.
 *
 * Used by `describe.skipIf(!hasChrome())` so a CI runner WITHOUT Chrome degrades gracefully
 * (the browser suite skips) instead of hard-failing. GitHub `ubuntu-latest` ships Chrome, so
 * there the probe passes and the real rendered audit runs.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

let cached: boolean | undefined;

export function hasChrome(): boolean {
  if (cached === undefined) cached = detect();
  return cached;
}

function detect(): boolean {
  // macOS
  if (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")) return true;
  // Windows
  for (const p of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (existsSync(p)) return true;
  }
  // Linux / PATH — channel:chrome resolves google-chrome(-stable).
  const which = process.platform === "win32" ? "where" : "which";
  for (const bin of ["google-chrome", "google-chrome-stable", "chrome"]) {
    const r = spawnSync(which, [bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim().length > 0) return true;
  }
  return false;
}
