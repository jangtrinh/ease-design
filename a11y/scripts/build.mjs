// Build the a11y-audit CLI bundle.  Usage: node scripts/build.mjs [--watch]
//
// playwright ships browser drivers and @axe-core/playwright carries the axe bundle — both
// stay EXTERNAL (resolved from node_modules at run time) rather than being inlined. Node
// builtins (node:path, node:url) are external by default.
import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const options = {
  bundle: true,
  target: 'es2022',
  logLevel: 'info',
  entryPoints: [resolve(root, 'cli/src/a11y-audit.ts')],
  platform: 'node',
  format: 'esm',
  outfile: resolve(root, 'cli/dist/a11y-audit.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: ['playwright', '@axe-core/playwright', 'axe-core'],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('a11y-audit: watching…');
} else {
  await esbuild.build(options);
}
