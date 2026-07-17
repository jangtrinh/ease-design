/**
 * Hand-rolled CLI argument parser for the `ui` binary.
 * Handles `--key value`, `--key=value`, bare boolean flags, `--`, short flags `-h`/`-v`.
 * Zero dependencies — deterministic, pure transform.
 */

export interface ParsedArgs {
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
  help: boolean;
  version: boolean;
  json: boolean;
  /**
   * Flag keys supplied more than once on the command line (F4, spec 009 P3).
   * `flags` stores only the last value — scalar map, `cli-args.ts:11` — so a
   * repeated `--css a --css b` silently drops `a` there. A command that needs
   * every value (e.g. `designmd extract-tokens --css`) can check this set and
   * hard-error rather than silently losing data; commands that don't care can
   * ignore it. Additive — no existing consumer of `flags` is affected.
   */
  repeatedFlags: Set<string>;
}

/**
 * Parse `process.argv.slice(2)` into structured args.
 *
 * Rules:
 * - `--key value`  → string flag when next token is not a named flag
 * - `--key=value`  → string flag (inline, never ambiguous)
 * - `--key` alone  → boolean true when next token is absent or is itself a flag
 * - `-h` / `-v`    → aliases for --help / --version
 * - `--`           → all subsequent tokens become positionals
 * - First non-flag → command; second non-flag → subcommand; rest → positionals.
 *
 * Value vs flag disambiguation for `--key <next>`:
 *   Next token is consumed as a VALUE when:
 *     - It starts with a digit or is a bare `-` followed by a digit (numeric, e.g. "-0.6").
 *     - It does not start with `--` and is not the short flags `-h` or `-v`.
 *   Next token is treated as a new FLAG (key gets boolean true) when:
 *     - It starts with `--` (another long flag).
 *     - It is `-h` or `-v` (recognised short flags).
 *   This allows `--oklch "-0.6 0.2 250"` to be captured as a string value,
 *   while `--json --help` correctly keeps --json as boolean true.
 */
/**
 * Return true when a token should be consumed as a flag's string value rather
 * than treated as the next flag.
 *
 * A token is a VALUE when it is not a named flag:
 *   - Long flags (`--foo`) → not a value.
 *   - Recognised short flags (`-h`, `-v`) → not a value.
 *   - Numeric-looking tokens (`-0.6`, `-42`) → value (negative numbers).
 *   - Everything else that doesn't start with `-` → value.
 */
function isValueToken(token: string): boolean {
  if (token.startsWith("--")) return false;
  if (token === "-h" || token === "-v") return false;
  // Bare `-` conventionally means "read from stdin" and is always a value.
  if (token === "-") return true;
  // A `-` followed by a digit is a negative number, not a flag.
  if (token.startsWith("-") && token.length > 1 && /^-[0-9]/.test(token)) return true;
  // Any other `-x` short flag is not a value.
  if (token.startsWith("-")) return false;
  return true;
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const repeatedFlags = new Set<string>();
  const setFlag = (key: string, value: string | boolean): void => {
    if (key in flags) repeatedFlags.add(key);
    flags[key] = value;
  };
  const positionals: string[] = [];
  let doubleDashSeen = false;
  let i = 0;

  while (i < args.length) {
    const token = args[i];
    if (token === undefined) { i++; continue; }

    if (doubleDashSeen) {
      positionals.push(token);
      i++;
      continue;
    }

    if (token === "--") {
      doubleDashSeen = true;
      i++;
      continue;
    }

    if (token === "-h") {
      setFlag("help", true);
      i++;
      continue;
    }

    if (token === "-v") {
      setFlag("version", true);
      i++;
      continue;
    }

    if (token.startsWith("--")) {
      const withoutDashes = token.slice(2);
      const eqIdx = withoutDashes.indexOf("=");
      if (eqIdx !== -1) {
        // --key=value
        const key = withoutDashes.slice(0, eqIdx);
        const val = withoutDashes.slice(eqIdx + 1);
        setFlag(key, val);
      } else {
        // Peek ahead to decide: value or boolean flag?
        const next = args[i + 1];
        if (next !== undefined && isValueToken(next)) {
          // --key value
          setFlag(withoutDashes, next);
          i += 2;
          continue;
        } else {
          // bare boolean flag — next token is absent or is itself a flag
          setFlag(withoutDashes, true);
        }
      }
      i++;
      continue;
    }

    // Bare `-` (stdin sentinel) is a positional value, not a short flag.
    if (token === "-") {
      positionals.push(token);
      i++;
      continue;
    }

    if (token.startsWith("-")) {
      // Unknown short flag — treat as error-signal by storing it but continue
      // (caller can inspect and reject if needed)
      setFlag(token.slice(1), true);
      i++;
      continue;
    }

    // Non-flag token
    positionals.push(token);
    i++;
  }

  // Carve out command + subcommand from front of positionals
  let command: string | undefined;
  let subcommand: string | undefined;

  if (positionals.length >= 1) {
    command = positionals.shift();
  }
  if (positionals.length >= 1) {
    subcommand = positionals.shift();
  }

  const help = flags["help"] === true;
  const version = flags["version"] === true;
  const json = flags["json"] === true;

  return { command, subcommand, positionals, flags, help, version, json, repeatedFlags };
}
