// `figma-agent set-autolayout` — auto-layout / native GRID mapping for a node.
// --pad accepts CSS-style 1 or 4 comma-separated values (t,r,b,l).
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const MODE_MAP: Record<string, string> = {
  H: 'HORIZONTAL',
  HORIZONTAL: 'HORIZONTAL',
  V: 'VERTICAL',
  VERTICAL: 'VERTICAL',
  GRID: 'GRID',
  NONE: 'NONE',
};

function parsePadding(raw: string): { top: number; right: number; bottom: number; left: number } {
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.some(Number.isNaN) || (parts.length !== 1 && parts.length !== 4)) {
    throw new CliError('E_INVALID_ARGS', `--pad expects "n" or "t,r,b,l" numbers, got "${raw}"`);
  }
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const modeRaw = args.req('mode').toUpperCase();
  const mode = MODE_MAP[modeRaw];
  if (!mode) throw new CliError('E_INVALID_ARGS', `--mode must be H|V|GRID|NONE, got "${modeRaw}"`);

  const padRaw = args.str('pad');
  const colSizesRaw = args.str('col-sizes');
  return runCommand('SET_AUTOLAYOUT', {
    nodeId: args.req('node'),
    mode,
    gap: args.num('gap'),
    padding: padRaw ? parsePadding(padRaw) : undefined,
    alignPrimary: args.str('align-primary')?.toUpperCase(),
    alignCounter: args.str('align-counter')?.toUpperCase(),
    wrap: args.bool('wrap') || undefined,
    sizingH: args.str('sizing-h')?.toUpperCase(),
    sizingV: args.str('sizing-v')?.toUpperCase(),
    rows: args.num('rows'),
    cols: args.num('cols'),
    colSizes: colSizesRaw ? colSizesRaw.split(',').map((s) => s.trim()) : undefined,
  });
}
