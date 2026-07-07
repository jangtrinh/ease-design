// `figma-agent set-constraints` — node.constraints {horizontal, vertical}.
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const CONSTRAINT_VALUES = ['MIN', 'MAX', 'CENTER', 'STRETCH', 'SCALE'];

function parseConstraint(flag: string, raw: string): string {
  const value = raw.toUpperCase();
  if (!CONSTRAINT_VALUES.includes(value)) {
    throw new CliError('E_INVALID_ARGS', `--${flag} must be one of ${CONSTRAINT_VALUES.join('|')}, got "${raw}"`);
  }
  return value;
}

export async function run(args: CommandArgs): Promise<unknown> {
  return runCommand('SET_CONSTRAINTS', {
    nodeId: args.req('node'),
    horizontal: parseConstraint('h', args.req('h')),
    vertical: parseConstraint('v', args.req('v')),
  });
}
