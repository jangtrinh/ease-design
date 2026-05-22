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

describe("ui --help lists all Phase 2b commands", () => {
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
