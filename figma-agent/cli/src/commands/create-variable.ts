// `figma-agent create-variable` — create (or reuse, plugin de-dups) a variable
// in a collection. Value is coerced by --type before sending.
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const VARIABLE_TYPES = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'] as const;
type VariableType = (typeof VARIABLE_TYPES)[number];

function coerceValue(type: VariableType, raw: string): string | number | boolean {
  if (type === 'FLOAT') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new CliError('E_INVALID_ARGS', `--value must be numeric for FLOAT, got "${raw}"`);
    return n;
  }
  if (type === 'BOOLEAN') {
    if (raw !== 'true' && raw !== 'false') throw new CliError('E_INVALID_ARGS', `--value must be true|false for BOOLEAN, got "${raw}"`);
    return raw === 'true';
  }
  return raw; // COLOR (hex/css string) and STRING pass through
}

export async function run(args: CommandArgs): Promise<unknown> {
  const type = args.req('type').toUpperCase() as VariableType;
  if (!VARIABLE_TYPES.includes(type)) {
    throw new CliError('E_INVALID_ARGS', `--type must be one of ${VARIABLE_TYPES.join('|')}, got "${type}"`);
  }
  return runCommand('CREATE_VARIABLE', {
    collection: args.req('collection'),
    name: args.req('name'),
    type,
    value: coerceValue(type, args.req('value')),
    mode: args.str('mode'),
  });
}
