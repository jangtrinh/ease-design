/**
 * Cross-consistency guard for `ui schema` (P01).
 *
 * The signature table (src/core/command-signatures.ts) is newly-authored
 * metadata — nothing forces it to track the real parser. This suite pins it
 * to the documented contract instead: every command in the table must exist,
 * every flag and error code declared in a signature must appear VERBATIM in
 * that command's --help text, and every registered command must have a
 * schema entry. Drift in either direction fails here, not in production.
 */
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import {
  COMMAND_SIGNATURES,
  signatureFor,
} from "../src/core/command-signatures.js";
import type { CommandSignature } from "../src/core/command-signatures.js";

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

/** All (label, signature, helpText) triples flattened from the table. */
function allSignatures(): Array<{ label: string; sig: CommandSignature; help: string }> {
  const out: Array<{ label: string; sig: CommandSignature; help: string }> = [];
  for (const [name, entry] of Object.entries(COMMAND_SIGNATURES)) {
    const help = capture([name, "--help"]).stdout;
    if (entry.subcommands !== undefined) {
      for (const [sub, sig] of Object.entries(entry.subcommands)) {
        out.push({ label: `${name} ${sub}`, sig, help });
      }
    }
    if (entry.signature !== undefined) {
      out.push({ label: name, sig: entry.signature, help });
    }
  }
  return out;
}

describe("schema ↔ help cross-consistency", () => {
  it("every schema command resolves to a real command (help exits 0)", () => {
    for (const name of Object.keys(COMMAND_SIGNATURES)) {
      const { exitCode, stdout } = capture([name, "--help"]);
      expect(exitCode, `'ui ${name} --help' should exist`).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    }
  });

  it("every registered command has a schema entry (root help parity)", () => {
    const rootHelp = capture(["--help"]).stdout;
    const commandsSection = rootHelp.split("Commands:")[1]?.split("\nOptions:")[0] ?? "";
    const commandLines = [...commandsSection.matchAll(/^ {2}(\S+)/gm)]
      .map((m) => m[1])
      .filter((c): c is string => c !== undefined);
    expect(commandLines.length).toBeGreaterThan(10);
    for (const name of commandLines) {
      expect(
        COMMAND_SIGNATURES[name],
        `command '${name}' is in root help but missing from COMMAND_SIGNATURES`,
      ).toBeDefined();
    }
  });

  it("every declared flag appears verbatim in the command's help text", () => {
    for (const { label, sig, help } of allSignatures()) {
      for (const flag of sig.flags) {
        expect(
          help.includes(`--${flag.name}`),
          `'ui ${label}' declares --${flag.name} but help never mentions it`,
        ).toBe(true);
      }
    }
  });

  it("every declared error code appears verbatim in the command's help text", () => {
    for (const { label, sig, help } of allSignatures()) {
      for (const code of sig.errorCodes) {
        expect(
          new RegExp(`\\b${code}\\b`).test(help),
          `'ui ${label}' declares error code ${code} but help never mentions it`,
        ).toBe(true);
      }
    }
  });

  it("every enum value appears in the command's help text", () => {
    for (const { label, sig, help } of allSignatures()) {
      for (const flag of sig.flags) {
        for (const v of flag.values ?? []) {
          expect(
            help.includes(v),
            `'ui ${label}' --${flag.name} enum value '${v}' missing from help`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("signatureFor lookup", () => {
  it("resolves flat and nested signatures, null otherwise", () => {
    expect(signatureFor("autofix", undefined)).not.toBeNull();
    expect(signatureFor("ds", "init")).not.toBeNull();
    expect(signatureFor("ds", undefined)).toBeNull();
    expect(signatureFor("ds", "bogus")).toBeNull();
    expect(signatureFor("nope", undefined)).toBeNull();
  });
});
