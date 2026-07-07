// `figma-agent html-to-figma` — read HTML (--html file or stdin), inline
// external images as data: URIs FIRST (keeps plugin networkAccess narrow),
// then send {html,width,x,y,parentId,replaceId} for iframe render + import.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import { inlineImages } from '../util/inline-images.ts';
import { readStdin } from '../util/read-stdin.ts';

export async function run(args: CommandArgs): Promise<unknown> {
  const htmlArg = args.str('html');
  let rawHtml: string;
  if (!htmlArg || htmlArg === '-') {
    rawHtml = await readStdin();
  } else {
    try {
      rawHtml = readFileSync(resolve(htmlArg), 'utf8');
    } catch (err) {
      throw new CliError('E_INVALID_ARGS', `cannot read --html file "${htmlArg}": ${(err as Error).message}`);
    }
  }
  if (!rawHtml.trim()) throw new CliError('E_INVALID_ARGS', 'html input is empty');

  const { html, warnings: inlineWarnings } = await inlineImages(rawHtml);
  const result = (await runCommand('HTML_TO_FIGMA', {
    html,
    width: args.num('width') ?? 1280,
    x: args.num('x'),
    y: args.num('y'),
    parentId: args.str('parent'),
    replaceId: args.str('replace'),
  })) as Record<string, unknown>;

  // Surface CLI-side inlining warnings alongside plugin conversion warnings.
  const pluginWarnings = Array.isArray(result?.warnings) ? (result.warnings as unknown[]) : [];
  return { ...result, warnings: [...pluginWarnings, ...inlineWarnings] };
}
