/**
 * `ui schema` command behavior + the central unknown-flag guard it powers.
 */
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

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

describe("ui schema", () => {
  it("--json emits an envelope with globalFlags, globalErrorCodes, and commands", () => {
    const { exitCode, stdout } = capture(["schema", "--json"]);
    expect(exitCode).toBe(0);
    const env = JSON.parse(stdout) as {
      ok: boolean;
      command: string;
      data: {
        globalFlags: Array<{ name: string }>;
        globalErrorCodes: string[];
        commands: Record<string, { subcommands?: object; signature?: object }>;
      };
    };
    expect(env.ok).toBe(true);
    expect(env.command).toBe("schema");
    expect(env.data.globalFlags.map((f) => f.name)).toContain("json");
    expect(env.data.globalErrorCodes).toContain("UNKNOWN_FLAG");
    // Nested dispatcher command with per-subcommand signatures
    expect(env.data.commands["ds"]?.subcommands).toBeDefined();
    // Flat command with a direct signature
    expect(env.data.commands["autofix"]?.signature).toBeDefined();
    // schema documents itself
    expect(env.data.commands["schema"]).toBeDefined();
  });

  it("text mode renders one usage line per (sub)command", () => {
    const { exitCode, stdout } = capture(["schema"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ui ds init <name> --persona <v> --intent <v>");
    expect(stdout).toContain("ui tokens compile <file.json> [--target <css|tailwind|figma>]");
    expect(stdout).toContain("Global flags: --json --help --version");
  });

  it("required flags render unbracketed; optional flags bracketed", () => {
    const { stdout } = capture(["schema"]);
    // registry register: --category/--markup required, --force optional
    expect(stdout).toMatch(/ui registry register <Category\/Variant> --category <v> --markup <v>.*\[--force\]/);
  });
});

describe("central unknown-flag guard (schema-powered)", () => {
  it("rejects a hallucinated flag on a flat command with a did-you-mean hint", () => {
    const { exitCode, stderr } = capture(["export", "x.html", "--titel", "Hi"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("unknown flag '--titel'");
    expect(stderr).toContain("did you mean '--title'?");
  });

  it("rejects an unknown flag on a dispatcher subcommand (JSON envelope)", () => {
    const { exitCode, stdout } = capture(["tokens", "compile", "t.json", "--taregt", "css", "--json"]);
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout) as { ok: boolean; command: string; error: { code: string; message: string } };
    expect(env.ok).toBe(false);
    expect(env.command).toBe("tokens compile");
    expect(env.error.code).toBe("UNKNOWN_FLAG");
    expect(env.error.message).toContain("--target");
  });

  it("accepts every documented flag (no false positives on real invocations)", () => {
    // --to is documented-but-ignored by the impl; the guard must still allow it.
    const { exitCode } = capture(["color", "convert", "--oklch", "0.7 0.1 250", "--to", "hex"]);
    expect(exitCode).toBe(0);
  });

  it("unknown subcommand falls through to the command's own BAD_ARG (not the guard)", () => {
    const { exitCode, stderr } = capture(["ds", "frobnicate", "--whatever", "x"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("unknown subcommand");
  });
});
