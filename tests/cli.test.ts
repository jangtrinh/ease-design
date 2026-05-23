import { describe, expect, it } from "vitest";

import { run } from "../src/cli.js";

function captureHelp(): string {
  let out = "";
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try {
    run(["--help"]);
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

describe("ui cli router", () => {
  it("exits 0 for --help", () => {
    expect(run(["--help"])).toBe(0);
  });

  it("exits 0 for no arguments", () => {
    expect(run([])).toBe(0);
  });

  it("exits 0 for --version", () => {
    expect(run(["--version"])).toBe(0);
  });

  it("exits 1 for an unknown command", () => {
    expect(run(["frobnicate"])).toBe(1);
  });
});

describe("ui --help lists all registered commands", () => {
  it("lists autofix in root help", () => {
    expect(captureHelp()).toContain("autofix");
  });

  it("lists validate-layout in root help", () => {
    expect(captureHelp()).toContain("validate-layout");
  });

  it("lists registry in root help", () => {
    expect(captureHelp()).toContain("registry");
  });
});

describe("ui ds dispatcher", () => {
  it("ui --help lists ds", () => {
    expect(captureHelp()).toContain("ds");
  });

  it("ui ds (no subcommand) exits 1 with 'requires a subcommand'", () => {
    let stderr = "";
    const origErr = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = (c: any) => { stderr += String(c); return true; };
    let exitCode: number;
    try {
      exitCode = run(["ds"]);
    } finally {
      process.stderr.write = origErr;
    }
    expect(exitCode!).toBe(1);
    expect(stderr).toContain("requires a subcommand");
  });

  it("ui ds nope exits 1 with 'unknown subcommand'", () => {
    let stderr = "";
    const origErr = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = (c: any) => { stderr += String(c); return true; };
    let exitCode: number;
    try {
      exitCode = run(["ds", "nope"]);
    } finally {
      process.stderr.write = origErr;
    }
    expect(exitCode!).toBe(1);
    expect(stderr).toContain("unknown subcommand");
  });

  it("ui ds --help prints DS_HELP", () => {
    let stdout = "";
    const origOut = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = (c: any) => { stdout += String(c); return true; };
    let exitCode: number;
    try {
      exitCode = run(["ds", "--help"]);
    } finally {
      process.stdout.write = origOut;
    }
    expect(exitCode!).toBe(0);
    expect(stdout).toContain("ui ds");
    expect(stdout).toContain("init");
    expect(stdout).toContain("context");
    expect(stdout).toContain("change-token");
    expect(stdout).toContain("status");
  });
});
