// `figma-agent scan-design-system` — components/variables/styles registry.
// With --out the full registry goes to a file and only {path,counts} prints.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const result = await runCommand('SCAN_DESIGN_SYSTEM', {});
  const outArg = args.str('out');
  if (!outArg) return result;

  const outPath = resolve(outArg);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  const counts = (result as { counts?: unknown } | null)?.counts ?? null;
  return { path: outPath, counts };
}
