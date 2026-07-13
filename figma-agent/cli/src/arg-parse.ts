// argv parsing for the figma-agent CLI — extracted from the entry so it can be
// unit-tested without importing (and thus executing) figma-agent.ts's main().
// figma-agent.ts re-exports CommandArgs from here, so command files keep their
// `import type { CommandArgs } from '../figma-agent.ts'` paths unchanged.
import { CliError } from './transport/protocol-helpers.ts';

/** Parsed argv handed to every command. */
export interface CommandArgs {
  positionals: string[];
  str(name: string): string | undefined;
  req(name: string): string;
  num(name: string): number | undefined;
  bool(name: string): boolean;
}

export function parseArgs(argv: string[]): CommandArgs {
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[body] = argv[++i];
    else flags[body] = true;
  }
  const str = (name: string): string | undefined => {
    const value = flags[name];
    return value === undefined || value === true ? undefined : value;
  };
  return {
    positionals,
    str,
    req(name) {
      const value = str(name);
      if (value === undefined) throw new CliError('E_INVALID_ARGS', `missing required --${name}`);
      return value;
    },
    num(name) {
      const value = str(name);
      if (value === undefined) return undefined;
      const parsed = Number(value);
      if (Number.isNaN(parsed)) throw new CliError('E_INVALID_ARGS', `--${name} must be a number, got "${value}"`);
      return parsed;
    },
    bool(name) {
      return flags[name] !== undefined && flags[name] !== 'false';
    },
  };
}
