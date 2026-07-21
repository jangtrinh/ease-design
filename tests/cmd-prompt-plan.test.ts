import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { validPromptPlan } from "./fixtures/prompt-plan/prompt-plan-fixture.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

function fixture(plan = validPromptPlan()): string {
  const directory = mkdtempSync(join(tmpdir(), "prompt-plan-"));
  const file = join(directory, "plan.json");
  writeFileSync(file, JSON.stringify(plan));
  return file;
}

describe("ui prompt-plan", () => {
  it("validates and preflights a ready plan", () => {
    for (const subcommand of ["validate", "preflight"]) {
      const result = capture(["prompt-plan", subcommand, fixture(), "--json"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).data.ready).toBe(true);
    }
  });

  it("returns stable errors for bad input and flags", () => {
    const bad = fixture({ kind: "other" });
    expect(JSON.parse(capture(["prompt-plan", "validate", bad, "--json"]).out).error.code)
      .toBe("BAD_PROMPT_PLAN");
    expect(JSON.parse(capture([
      "prompt-plan", "validate", fixture(), "--bogus", "--json",
    ]).out).error.code).toBe("UNKNOWN_FLAG");
  });
});
