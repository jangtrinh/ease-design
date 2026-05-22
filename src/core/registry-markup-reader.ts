/**
 * Markup source resolution for `ui registry register --markup <file|->`.
 *
 * `readMarkup` is extracted here so the stdin branch (`"-"`) can be tested
 * by injecting a synthetic reader without spawning a subprocess or requiring
 * a pre-built binary.
 *
 * The `StdinReader` type is the injection seam: in production it calls
 * `readSync` on fd 0; in tests it returns canned bytes from a Buffer.
 */
import { readFileSync } from "node:fs";
import { RegistryError } from "./registry-store.js";

// ─── Injection seam ───────────────────────────────────────────────────────────

/**
 * Read synchronously from stdin into `buf` at `offset` for up to `length`
 * bytes. Return the number of bytes read (0 = EOF).
 *
 * Mirrors the signature of `fs.readSync(fd, buf, offset, length, position)`.
 */
export type StdinReader = (buf: Buffer, offset: number, length: number) => number;

/** Production implementation — reads from the real stdin fd. */
export function makeNodeStdinReader(): StdinReader {
  // Deferred import so the module can be loaded in tests without touching stdin.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stdin } = require("node:process") as typeof import("node:process");
  return (buf, offset, length) => readSync(stdin.fd, buf, offset, length, null);
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Read markup from a file path or from stdin when `markupArg === "-"`.
 *
 * @param markupArg  The `--markup` flag value: a file path or `"-"`.
 * @param stdinReader  Injection seam for stdin reads (defaults to real stdin).
 *                     Only used when `markupArg === "-"`.
 */
export function readMarkup(
  markupArg: string,
  stdinReader: StdinReader = makeNodeStdinReader(),
): string {
  if (markupArg === "-") {
    try {
      const chunks: Buffer[] = [];
      const buf = Buffer.alloc(65536);
      let n: number;
      do {
        n = stdinReader(buf, 0, buf.length);
        if (n > 0) chunks.push(Buffer.from(buf.subarray(0, n)));
      } while (n > 0);
      return Buffer.concat(chunks).toString("utf8");
    } catch (e) {
      throw new RegistryError(
        "READ_ERROR",
        `cannot read markup from stdin: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    return readFileSync(markupArg, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new RegistryError("FILE_NOT_FOUND", `markup file not found: '${markupArg}'`);
    }
    throw new RegistryError(
      "READ_ERROR",
      `cannot read markup file '${markupArg}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
