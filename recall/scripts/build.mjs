// Build the recall CLI bundle.  Usage: node scripts/build.mjs [--watch]
//
// sqlite-vec ships a platform-specific loadable extension and @huggingface/transformers
// carries ONNX runtime assets — both stay EXTERNAL (resolved from node_modules at run
// time) rather than being inlined. `node:sqlite` is a builtin and is external by default.
import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const options = {
  bundle: true,
  target: 'es2022',
  logLevel: 'info',
  entryPoints: [resolve(root, 'cli/src/recall.ts')],
  platform: 'node',
  format: 'esm',
  outfile: resolve(root, 'cli/dist/recall.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: ['sqlite-vec', '@huggingface/transformers'],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('recall: watching…');
} else {
  await esbuild.build(options);
}
