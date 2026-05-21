import { describe, expect, it } from "vitest";

import { run } from "../src/cli.js";

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
