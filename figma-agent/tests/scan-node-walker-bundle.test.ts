// DIST-BUNDLE guard (spec 005) — the walker `scan-node` injects must be self-contained.
//
// The spike bundled plugin/src/main/scan-node.ts at RUNTIME, which quietly made the
// mirror repo-only: a dist-only install has neither plugin/src nor esbuild, so every
// scan degraded to a "failed" entry and the loop could never close there. The walker is
// now bundled at BUILD time into cli/src/generated/scan-node-walker-bundle.ts.
//
// A generated artifact needs a linter, not just an emitter (CLAUDE.md), so this suite is
// the pair to scripts/build.mjs → buildWalkerBundle: it fails when the committed bundle
// goes stale, and when scan-node.ts grows a runtime read of plugin/src back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { SCAN_NODE_WALKER_BUNDLE } from '../cli/src/generated/scan-node-walker-bundle.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commandSrc = readFileSync(resolve(root, 'cli/src/commands/scan-node.ts'), 'utf8');
/** The command's CODE — comments explain the build-time bundling and may name those paths. */
const commandCode = commandSrc.replace(/^\s*\/\/.*$/gm, '');

describe('scan-node walker bundle', () => {
  it('is a self-contained IIFE exposing the walker entry points', () => {
    expect(SCAN_NODE_WALKER_BUNDLE).toContain('var __scan');
    expect(SCAN_NODE_WALKER_BUNDLE).toContain('nodeToSpec');
    expect(SCAN_NODE_WALKER_BUNDLE).toContain('readTokenNameMap');
    // Self-contained = the sub-walkers are inlined, not imported at run time.
    expect(SCAN_NODE_WALKER_BUNDLE).not.toMatch(/\brequire\(|\bfrom ['"]\.\//);
  });

  it('matches a fresh bundle of the walker source (committed artifact is not stale)', async () => {
    // Must mirror scripts/build.mjs → buildWalkerBundle exactly.
    const res = await esbuild.build({
      entryPoints: [resolve(root, 'plugin/src/main/scan-node.ts')],
      bundle: true,
      target: 'es2020',
      platform: 'browser',
      format: 'iife',
      globalName: '__scan',
      write: false,
      logLevel: 'silent',
    });
    expect(SCAN_NODE_WALKER_BUNDLE).toBe(res.outputFiles[0].text);
  });
});

describe('scan-node command (dist-only safety)', () => {
  it('injects the pre-bundled walker', () => {
    expect(commandSrc).toContain("from '../generated/scan-node-walker-bundle.ts'");
    expect(commandSrc).toContain('${SCAN_NODE_WALKER_BUNDLE}');
  });

  it('never reaches for plugin/src or esbuild at run time', () => {
    expect(commandCode).not.toMatch(/plugin\/src/);
    expect(commandCode).not.toMatch(/from ['"]esbuild['"]/);
    expect(commandCode).not.toMatch(/readFileSync|fileURLToPath|node:fs|node:path/);
  });
});
