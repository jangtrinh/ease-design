// spec 004 P4 — the broker's idle-window config reader. Order: FIGMA_AGENT_IDLE_MS
// env → design/figma-sync.json {"idleMs"} → DEFAULT_IDLE_MS, with a MIN_IDLE_MS floor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIdleMs, projectDir, syncConfigPath } from '../cli/src/transport/figma-sync-config.ts';
import { DEFAULT_IDLE_MS, MIN_IDLE_MS } from '../shared/protocol.ts';

let dir: string;
const prevDir = process.env['FIGMA_AGENT_CHANGES_DIR'];
const prevIdle = process.env['FIGMA_AGENT_IDLE_MS'];

function writeConfig(obj: unknown): void {
  writeFileSync(syncConfigPath(), JSON.stringify(obj), 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-sync-cfg-'));
  process.env['FIGMA_AGENT_CHANGES_DIR'] = join(dir, 'design');
  mkdirSync(join(dir, 'design'), { recursive: true });
  delete process.env['FIGMA_AGENT_IDLE_MS'];
});
afterEach(() => {
  if (prevDir === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
  else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevDir;
  if (prevIdle === undefined) delete process.env['FIGMA_AGENT_IDLE_MS'];
  else process.env['FIGMA_AGENT_IDLE_MS'] = prevIdle;
  rmSync(dir, { recursive: true, force: true });
});

describe('figma-sync-config — readIdleMs', () => {
  it('defaults to DEFAULT_IDLE_MS when no config + no env', () => {
    expect(readIdleMs()).toBe(DEFAULT_IDLE_MS);
  });
  it('reads idleMs from design/figma-sync.json', () => {
    writeConfig({ idleMs: 10_000 });
    expect(readIdleMs()).toBe(10_000);
  });
  it('the env override wins over the file (fast manual testing)', () => {
    writeConfig({ idleMs: 300_000 });
    process.env['FIGMA_AGENT_IDLE_MS'] = '10000';
    expect(readIdleMs()).toBe(10_000);
  });
  it('floors a too-small value to MIN_IDLE_MS', () => {
    writeConfig({ idleMs: 50 });
    expect(readIdleMs()).toBe(MIN_IDLE_MS);
  });
  it('falls back to DEFAULT_IDLE_MS on a malformed config', () => {
    writeFileSync(syncConfigPath(), '{ not json', 'utf8');
    expect(readIdleMs()).toBe(DEFAULT_IDLE_MS);
  });
  it('a non-numeric idleMs falls back to DEFAULT_IDLE_MS', () => {
    writeConfig({ idleMs: 'soon' });
    expect(readIdleMs()).toBe(DEFAULT_IDLE_MS);
  });
  it('projectDir is the parent of the design/ change-log dir', () => {
    expect(projectDir()).toBe(dir);
  });
});
