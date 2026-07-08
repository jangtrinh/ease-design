// `figma-agent capture` — Playwright-driven site capture into the unified
// per-URL folder <slug>/capture/. Writes manifest.json (assets), behavior.json
// (animation/interaction/state), page.html, assets/, screenshots/, and
// capture-summary.md. No Figma plugin required. Track 5 Commit 3.
//
// LIVE-E2E covered by Playwright (no plugin): see tests + the plan's Commit 3
// verify. Deterministic `ui` binary is untouched — capture is the hand.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { resolveCaptureDir, slugifyUrl } from '../capture/slug.ts';
import { inPageManifestWalk, type Manifest } from '../capture/manifest-walk.ts';
import { inPageBehaviorStatic } from '../capture/behavior-static.ts';
import { buildBehavior } from '../capture/behavior-probe.ts';
import { downloadAssets } from '../capture/asset-download.ts';
import {
  launchBrowser, dismissConsent, pollHydration, autoScroll, type AccessOptions,
} from '../capture/browser-access.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const url = args.str('url') ?? args.positionals[0];
  if (!url) throw new CliError('E_INVALID_ARGS', 'capture requires a URL (positional or --url)');

  const baseDir = args.str('out') ? args.str('out')! : process.cwd();
  const opts: AccessOptions = {
    url,
    headed: !args.bool('headless'),          // headed real-browser is the default (WAF long-tail)
    channel: args.str('channel') ?? (args.bool('headless') ? undefined : 'chrome'),
    width: args.num('width') ?? 1440,
    timeoutMs: args.num('timeout') ?? 45000,
  };
  const carouselWindowMs = args.num('carousel-window') ?? 6000;

  const captureDir = resolveCaptureDir(baseDir, url);
  const assetsDir = join(captureDir, 'assets');
  const shotsDir = join(captureDir, 'screenshots');
  await mkdir(assetsDir, { recursive: true });
  await mkdir(shotsDir, { recursive: true });

  const { browser, wafPath } = await launchBrowser(opts);
  try {
    const context = await browser.newContext({ viewport: { width: opts.width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => wafPath.push('networkidle timeout'));
    await dismissConsent(page, wafPath);
    await pollHydration(page, wafPath, 12000);
    await autoScroll(page, wafPath);

    // ── Manifest (assets) ────────────────────────────────────────────────
    const walk = await page.evaluate(inPageManifestWalk);
    const manifest: Manifest = { version: 1, url, capturedAt: new Date().toISOString(), ...walk };

    // ── Behavior (animation/interaction/state) — CDP + real hover/focus ───
    const staticBehavior = await page.evaluate(inPageBehaviorStatic);
    const behavior = await buildBehavior(page, cdp, url, staticBehavior, carouselWindowMs);

    // ── Asset download (bg images + webfonts) ─────────────────────────────
    const bgUrls = manifest.backgroundImages.map((b) => b.url);
    const fontUrls = manifest.fontFaces.map((f) => f.src);
    const downloaded = await downloadAssets([...bgUrls, ...fontUrls], assetsDir);

    // ── Screenshots (fullpage + deterministic section bands) ──────────────
    await page.screenshot({ path: join(shotsDir, 'fullpage.png'), fullPage: true }).catch(() => {});
    const bandCount = Math.min(6, Math.max(1, Math.ceil(manifest.viewport.scrollH / manifest.viewport.h)));
    for (let i = 0; i < bandCount; i++) {
      const y = i * manifest.viewport.h;
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(shotsDir, `sections-${i}.png`) }).catch(() => {});
    }

    // ── page.html (rendered clone; <base> injected so relative assets load) ─
    const html = await page.content();
    const withBase = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<base href="${url}">`);
    await writeFile(join(captureDir, 'page.html'), withBase, 'utf8');

    // ── Write manifest + behavior + summary ───────────────────────────────
    await writeFile(join(captureDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await writeFile(join(captureDir, 'behavior.json'), JSON.stringify(behavior, null, 2), 'utf8');

    const hoverCount = behavior.elements.filter((e) => e.states.hover).length;
    const summary = [
      `# Capture summary — ${url}`,
      '',
      `- Slug: \`${slugifyUrl(url)}\``,
      `- Captured: ${manifest.capturedAt}`,
      `- Viewport: ${manifest.viewport.w}×${manifest.viewport.h}, scrollHeight ${manifest.viewport.scrollH}`,
      '',
      '## Access ladder (WAF path)',
      ...wafPath.map((p) => `- ${p}`),
      '',
      '## Manifest',
      `- Used fonts: ${manifest.usedFonts.length}`,
      `- @font-face rules: ${manifest.fontFaces.length}`,
      `- Background images: ${manifest.backgroundImages.length}`,
      `- <img>: ${manifest.images.length} · canvases: ${manifest.canvases.length} · videos: ${manifest.videos.length}`,
      `- Assets downloaded: ${downloaded.length}`,
      '',
      '## Behavior',
      `- Keyframes: ${Object.keys(behavior.keyframes).length}`,
      `- Elements w/ transitions/animations/states: ${behavior.elements.length} (hover deltas: ${hoverCount})`,
      `- Carousels: ${behavior.carousels.length} (autoplay: ${behavior.carousels.filter((c) => c.autoplayMs).length})`,
      '',
      '## Fidelity notes',
      '- page.html is the rendered DOM with a <base> tag; full data-URI inlining (SingleFile) is deferred.',
      '- WAF ladder stops before Cloudflare-Enterprise / DataDome (out of scope, ethical posture).',
      '',
    ].join('\n');
    await writeFile(join(captureDir, 'capture-summary.md'), summary, 'utf8');

    return {
      captureDir,
      slug: slugifyUrl(url),
      manifest: {
        usedFonts: manifest.usedFonts.length,
        backgroundImages: manifest.backgroundImages.length,
        images: manifest.images.length,
      },
      behavior: {
        keyframes: Object.keys(behavior.keyframes).length,
        elements: behavior.elements.length,
        hoverDeltas: hoverCount,
        carousels: behavior.carousels.length,
        carouselAutoplay: behavior.carousels.filter((c) => c.autoplayMs).length,
      },
      assetsDownloaded: downloaded.length,
      wafPath,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
