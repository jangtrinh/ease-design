// Single-JSON stdout contract: every command prints exactly one JSON object
// and exits 0 (result) or 1 ({error:{code,message}}).
import { CliError } from '../transport/protocol-helpers.ts';

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Print {error:{code,message}} and exit 1. Unknown errors map to E_INTERNAL. */
export function printErrorJson(err: unknown): never {
  const error =
    err instanceof CliError
      ? { code: err.code, message: err.message }
      : { code: 'E_INTERNAL', message: err instanceof Error ? err.message : String(err) };
  process.stdout.write(`${JSON.stringify({ error })}\n`);
  process.exit(1);
}
