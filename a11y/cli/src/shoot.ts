/**
 * `captureShots` — the render pass. Open each target in system Chrome and write a full-page
 * PNG per target. This is the ONLY browser-coupled module for `page-shot` (mirrors `audit.ts`);
 * the envelope/format/naming layer stays browser-free so its tests need no Chrome.
 *
 * Determinism: a FIXED viewport width (flag; default 900) at device-scale 1, plus
 * `prefers-reduced-motion: reduce` so motion-guarded animations (e.g. the kit spinner) freeze
 * to a stable frame — so the same page renders to the same pixels on the same machine/fonts,
 * which is exactly what `ui vr gate` needs.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { launchChrome } from "./browser.ts";
import { stem } from "./shot-envelope.ts";
import { toUrl } from "./targets.ts";
import type { ShotData, ShotEntry, ShotError } from "./shot-types.ts";

/** Default viewport width (CSS px). The height only seeds the page; `fullPage` grows it. */
export const DEFAULT_WIDTH = 900;
const SEED_HEIGHT = 600;

export interface ShotOptions {
  /** Directory to write PNGs into (created if missing). */
  outDir: string;
  /** Viewport width in CSS px (default {@link DEFAULT_WIDTH}). */
  width?: number;
}

/**
 * Render every target to `<outDir>/<stem>.png` and return the plain payload. Launches ONE
 * browser for the whole batch and closes it in `finally` (even on error). A single target's
 * failure is captured as an error entry and the batch continues; a browser that can't launch
 * throws {@link NoBrowserError} out of here for the CLI to map to a `NO_BROWSER` envelope.
 * Exit gating is the caller's job: 1 iff any error entry.
 */
export async function captureShots(targets: readonly string[], opts: ShotOptions): Promise<ShotData> {
  const width = opts.width ?? DEFAULT_WIDTH;
  await mkdir(opts.outDir, { recursive: true });
  const browser = await launchChrome();
  const context = await browser.newContext({
    viewport: { width, height: SEED_HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const shots: ShotEntry[] = [];
  const errors: ShotError[] = [];
  try {
    for (const target of targets) {
      const page = await context.newPage();
      try {
        await page.goto(toUrl(target), { waitUntil: "load" });
        const file = `${stem(target)}.png`;
        const buf = await page.screenshot({ fullPage: true, path: join(opts.outDir, file) });
        shots.push({ target, file, bytes: buf.length });
      } catch (e) {
        errors.push({ target, error: e instanceof Error ? e.message : String(e) });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return { shots, errors, out: opts.outDir, total: targets.length };
}
