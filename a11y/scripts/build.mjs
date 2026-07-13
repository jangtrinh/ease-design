// Build the a11y workspace CLI bundles.  Usage: node scripts/build.mjs [--watch]
//
// Two bins ship from here: `a11y-audit` (tier-2 rendered a11y) and `page-shot` (the render
// hand for `ui vr`). Both drive Playwright, so playwright + @axe-core/playwright stay EXTERNAL
// (resolved from node_modules at run time) rather than inlined. Node builtins (node:path,
// node:url) are external by default. Each output gets the node shebang banner and is marked
// executable so it can be run directly (or via an env-override path like DESIGN_OS_PAGE_SHOT_BIN).
import * as esbuild from 'esbuild';
import { chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const BINS = [
  { entry: 'cli/src/a11y-audit.ts', outfile: 'cli/dist/a11y-audit.js' },
  { entry: 'cli/src/page-shot.ts', outfile: 'cli/dist/page-shot.js' },
];

const optionsFor = ({ entry, outfile }) => ({
  bundle: true,
  target: 'es2022',
  logLevel: 'info',
  entryPoints: [resolve(root, entry)],
  platform: 'node',
  format: 'esm',
  outfile: resolve(root, outfile),
  banner: { js: '#!/usr/bin/env node' },
  external: ['playwright', '@axe-core/playwright', 'axe-core'],
});

if (watch) {
  for (const bin of BINS) {
    const ctx = await esbuild.context(optionsFor(bin));
    await ctx.watch();
  }
  console.log('a11y workspace: watching…');
} else {
  for (const bin of BINS) {
    await esbuild.build(optionsFor(bin));
    chmodSync(resolve(root, bin.outfile), 0o755);
  }
}
