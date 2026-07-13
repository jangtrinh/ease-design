/**
 * Browser strategy: use the INSTALLED Google Chrome via Playwright's `channel: "chrome"`.
 * This never downloads a browser — the workspace tier is allowed a browser, but not a
 * multi-hundred-MB Chromium download on every `npm ci`. If Chrome is not launchable we fail
 * loudly with a {@link NoBrowserError} → the CLI maps it to a `NO_BROWSER` envelope, exit 1.
 *
 * The deterministic `ui` kernel never imports this module; browsers live only here.
 */
import { chromium, type Browser } from "playwright";

/** Raised when system Chrome can't be launched — carries the remediation hint verbatim. */
export class NoBrowserError extends Error {
  constructor(cause: unknown) {
    super(
      "Could not launch Google Chrome (Playwright channel 'chrome'). " +
        "Install Google Chrome (https://www.google.com/chrome/), or run " +
        "`npx playwright install chromium`, then re-run. " +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "NoBrowserError";
  }
}

/**
 * Launch headless system Chrome. Throws {@link NoBrowserError} on any launch failure so the
 * caller can emit a single, well-known error envelope instead of a raw Playwright stack.
 */
export async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (e) {
    throw new NoBrowserError(e);
  }
}
