// Browser access ladder (ethical posture, plan invariant #6): drive a real
// headed Chrome by default; only pages the owner can view; no aggressive
// evasion. Handles launch (chrome channel → bundled chromium fallback),
// consent dismissal, hydration polling, and lazy-load auto-scroll.
// Track 5 Commit 3. playwright is imported dynamically (optional dependency).
import type { Browser, BrowserContext, Page } from 'playwright';

export interface AccessOptions {
  url: string;
  headed: boolean;
  channel?: string;      // 'chrome' | 'msedge' | undefined (bundled chromium)
  width: number;
  timeoutMs: number;
}

export interface AccessResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  wafPath: string[];     // human-readable ledger of the access steps taken
}

/** Launch a browser, preferring the requested channel, falling back to chromium. */
export async function launchBrowser(opts: AccessOptions): Promise<{ browser: Browser; wafPath: string[] }> {
  const pw = await import('playwright');
  const wafPath: string[] = [];
  const headless = !opts.headed;
  // Try the requested real-browser channel first (better WAF long-tail).
  if (opts.channel) {
    try {
      const browser = await pw.chromium.launch({ channel: opts.channel, headless });
      wafPath.push(`launched channel=${opts.channel} headless=${headless}`);
      return { browser, wafPath };
    } catch {
      wafPath.push(`channel=${opts.channel} unavailable → bundled chromium`);
    }
  }
  const browser = await pw.chromium.launch({ headless });
  wafPath.push(`launched bundled chromium headless=${headless}`);
  return { browser, wafPath };
}

const CONSENT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  'button[aria-label*="accept" i]',
  'button[aria-label*="agree" i]',
  'button:has-text("Accept all")',
  'button:has-text("Accept All")',
  'button:has-text("I agree")',
  'button:has-text("Got it")',
  'button:has-text("Allow all")',
  '.cookie button',
];

/** Dismiss common cookie/consent overlays (best-effort, never throws). */
export async function dismissConsent(page: Page, wafPath: string[]): Promise<void> {
  for (const sel of CONSENT_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 400 })) {
        await btn.click({ timeout: 1000 });
        wafPath.push(`consent dismissed via ${sel}`);
        await page.waitForTimeout(300);
        return;
      }
    } catch { /* try next */ }
  }
}

/** Poll until the page hydrates (links > 8) or the budget expires. */
export async function pollHydration(page: Page, wafPath: string[], budgetMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const linkCount = await page.evaluate(() => document.querySelectorAll('a[href]').length).catch(() => 0);
    if (linkCount > 8) {
      wafPath.push(`hydrated (${linkCount} links) in ${Date.now() - start}ms`);
      return;
    }
    await page.waitForTimeout(400);
  }
  wafPath.push(`hydration budget (${budgetMs}ms) elapsed — proceeding`);
}

/** Auto-scroll to the bottom in steps (triggers lazy-load), then return to top. */
export async function autoScroll(page: Page, wafPath: string[]): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.85);
    const max = document.body.scrollHeight;
    for (let y = 0; y < max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  }).catch(() => {});
  wafPath.push('auto-scrolled for lazy-load');
}
