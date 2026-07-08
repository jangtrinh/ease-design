/**
 * Output envelope types and emitter helpers for the `ui` binary.
 *
 * Commands return a CommandResult; run() in cli.ts writes to streams and
 * returns the exit code. This keeps command handlers pure and testable
 * without spawning a process.
 */
import type { WriteStream } from "node:tty";

export interface JsonEnvelope {
  ok: boolean;
  command: string;
  data?: unknown;
  error?: { code: string; message: string };
}

/**
 * Returned by every command handler. run() in cli.ts drives the actual
 * stream writes and process.exit so tests can stay synchronous.
 */
export interface CommandResult {
  exitCode: number;
  /** Written to stdout (text mode or JSON envelope string). */
  stdout?: string;
  /** Written to stderr (text mode errors). */
  stderr?: string;
}

// ─── Emitters ────────────────────────────────────────────────────────────────

/** Write a JSON envelope to stdout — 2-space indent, trailing newline. */
export function emitJson(
  out: Pick<WriteStream, "write">,
  envelope: JsonEnvelope,
): void {
  out.write(JSON.stringify(envelope, null, 2) + "\n");
}

/** Write plain text to a stream. */
export function emitText(out: Pick<WriteStream, "write">, text: string): void {
  out.write(text);
}

// ─── Result builders ─────────────────────────────────────────────────────────

/** Build a successful CommandResult (exit 0). */
export function ok(stdoutText: string): CommandResult {
  return { exitCode: 0, stdout: stdoutText };
}

/** Build a user-error CommandResult (exit 1) — text mode. */
export function errText(message: string): CommandResult {
  return { exitCode: 1, stderr: message };
}

/** Build a user-error CommandResult (exit 1) — JSON envelope mode. */
export function errJson(
  command: string,
  code: string,
  message: string,
): CommandResult {
  const envelope: JsonEnvelope = {
    ok: false,
    command,
    error: { code, message },
  };
  return { exitCode: 1, stdout: JSON.stringify(envelope, null, 2) + "\n" };
}

/**
 * Build a user-error CommandResult (exit 1) — JSON envelope mode — that also
 * carries a structured `data` payload alongside the error. Use when the error
 * itself is actionable machine-readable state (e.g. DIFF_NO_MATCH diagnostics a
 * caller feeds back for one repair attempt).
 */
export function errJsonWithData(
  command: string,
  code: string,
  message: string,
  data: unknown,
): CommandResult {
  const envelope: JsonEnvelope = {
    ok: false,
    command,
    data,
    error: { code, message },
  };
  return { exitCode: 1, stdout: JSON.stringify(envelope, null, 2) + "\n" };
}

/** Build a success CommandResult — JSON envelope mode. Exit code is always 0. */
export function okJson(command: string, data: unknown): CommandResult {
  const envelope: JsonEnvelope = { ok: true, command, data };
  return { exitCode: 0, stdout: JSON.stringify(envelope, null, 2) + "\n" };
}

/**
 * Build a success CommandResult with a caller-supplied exit code — JSON mode.
 * Use when the command ran successfully (`ok: true`) but the exit code conveys
 * a pass/fail signal independent of whether the command itself errored.
 * Example: validate-layout exits 1 when it finds errors, but `ok` stays true.
 */
export function okJsonWithExit(command: string, data: unknown, exitCode: number): CommandResult {
  const envelope: JsonEnvelope = { ok: true, command, data };
  return { exitCode, stdout: JSON.stringify(envelope, null, 2) + "\n" };
}

/** Build an internal-error CommandResult (exit 2). */
export function internalErr(message: string, useJson: boolean, command: string): CommandResult {
  if (useJson) {
    const envelope: JsonEnvelope = {
      ok: false,
      command,
      error: { code: "INTERNAL", message },
    };
    return { exitCode: 2, stdout: JSON.stringify(envelope, null, 2) + "\n" };
  }
  return { exitCode: 2, stderr: `ui: internal error: ${message}\n` };
}
