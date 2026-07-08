// Build all three bundles: cli, plugin-main (code.js), plugin-ui (ui.html).
// Usage: node scripts/build.mjs [cli|plugin-main|plugin-ui|all] [--watch]
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? 'all';
const watch = process.argv.includes('--watch');

const common = { bundle: true, target: 'es2020', logLevel: 'info' };

async function buildCli() {
  await esbuild.build({
    ...common,
    entryPoints: [resolve(root, 'cli/src/figma-agent.ts')],
    platform: 'node',
    format: 'esm',
    outfile: resolve(root, 'cli/dist/figma-agent.js'),
    banner: { js: '#!/usr/bin/env node' },
    // ws + the capture-only optional deps stay external (resolved at runtime;
    // playwright is heavy + has native deps and must not be inlined).
    external: ['ws', 'playwright', 'playwright-core', 'puppeteer-core', 'pixelmatch', 'pngjs'],
  });
}

async function buildPluginMain() {
  await esbuild.build({
    ...common,
    entryPoints: [resolve(root, 'plugin/src/main/main.ts')],
    platform: 'browser', // Figma plugin sandbox: no node APIs
    format: 'iife',
    outfile: resolve(root, 'plugin/code.js'),
  });
}

async function buildPluginUi() {
  const res = await esbuild.build({
    ...common,
    entryPoints: [resolve(root, 'plugin/src/ui/ui-relay.ts')],
    platform: 'browser',
    format: 'iife',
    write: false,
  });
  const js = res.outputFiles[0].text;
  // ui.html is a single self-contained file: minimal status UI + inlined bundle.
  const html = `<!doctype html>
<meta charset="utf-8">
<style>
  body{font:12px/1.5 -apple-system,sans-serif;margin:8px;color:#333}
  #status{padding:6px 8px;border-radius:6px;background:#eee}
  #status.ok{background:#d9f2df}
  #status.err{background:#fde2e2}
</style>
<div id="status">figma-agent: starting…</div>
<div id="detail"></div>
<script>${js}</script>`;
  mkdirSync(resolve(root, 'plugin'), { recursive: true });
  writeFileSync(resolve(root, 'plugin/ui.html'), html);
}

const jobs = { cli: buildCli, 'plugin-main': buildPluginMain, 'plugin-ui': buildPluginUi };
if (target === 'all') {
  for (const job of Object.values(jobs)) await job();
} else if (jobs[target]) {
  await jobs[target]();
} else {
  console.error(`unknown target: ${target}`);
  process.exit(1);
}
if (watch) console.log('(watch mode not implemented in spike — rerun to rebuild)');
