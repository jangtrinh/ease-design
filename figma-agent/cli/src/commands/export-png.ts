// `figma-agent export-png` — plugin exportAsync returns {base64,w,h};
// the CLI writes --out and prints {path,w,h} so Claude can Read the file.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const target = args.req('node'); // node id, or the literal "selection"
  const outPath = resolve(args.req('out'));
  const scale = args.num('scale') ?? 2;

  const result = (await runCommand('EXPORT_PNG', {
    nodeId: target === 'selection' ? undefined : target,
    useSelection: target === 'selection',
    scale,
  })) as { base64?: string; w?: number; h?: number };

  if (!result || typeof result.base64 !== 'string') {
    throw new CliError('E_PLUGIN_ERROR', 'EXPORT_PNG reply missing base64 image data');
  }
  writeFileSync(outPath, Buffer.from(result.base64, 'base64'));
  return { path: outPath, w: result.w, h: result.h };
}
