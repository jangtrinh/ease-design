import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}
const fixture = (name: string): string => join(process.cwd(), "tests", "fixtures", "delivery", name);

describe("ui delivery validate", () => {
  for (const name of ["design-brief-valid.json", "generation-contract-valid.json", "qualification-valid.json"]) {
    it(`accepts ${name}`, () => {
      const r = capture(["delivery", "validate", fixture(name), "--json"]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.out).data.errorCount).toBe(0);
    });
  }
  it("blocks a false QUALIFIED verdict with evidence-backed findings", () => {
    const r = capture(["delivery", "validate", fixture("qualification-false-green.json"), "--json"]);
    expect(r.code).toBe(1);
    const data = JSON.parse(r.out).data as { findings: Array<{ checkId: string }> };
    expect(data.findings.filter((f) => f.checkId === "false-qualified").length).toBeGreaterThanOrEqual(4);
  });
  it("requires all canonical marketing viewports and gates", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const contract = JSON.parse(String(requireFixture("generation-contract-valid.json"))) as Record<string, unknown>;
    contract["viewports"] = [1440, 390]; contract["requiredGates"] = ["taste-lint"];
    const file = join(dir, "contract.json"); writeFileSync(file, JSON.stringify(contract));
    const r = capture(["delivery", "validate", file, "--json"]);
    expect(r.code).toBe(1);
    const ids = JSON.parse(r.out).data.findings.map((f: { checkId: string }) => f.checkId);
    expect(ids).toContain("missing-viewport"); expect(ids).toContain("missing-gate");
  });
  it("rejects malformed JSON and unknown flags", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const file = join(dir, "bad.json"); writeFileSync(file, "{bad");
    expect(JSON.parse(capture(["delivery", "validate", file, "--json"]).out).error.code).toBe("BAD_DELIVERY");
    expect(JSON.parse(capture(["delivery", "validate", fixture("design-brief-valid.json"), "--bogus", "--json"]).out).error.code).toBe("UNKNOWN_FLAG");
  });
  it("rejects malformed evidence even when status is only a draft", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-"));
    const draft = {
      kind: "qualification-record", version: 1, contractRef: "contract.json", attempt: 1,
      status: "DRAFT_WITH_CONCERNS", machineGates: "none", renderedViewports: ["mobile"],
      mustCriteria: [{}], unsupportedClaimCount: -1, unresolvedFindings: [42],
    };
    const file = join(dir, "draft.json"); writeFileSync(file, JSON.stringify(draft));
    const r = capture(["delivery", "validate", file, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.errorCount).toBeGreaterThanOrEqual(4);
  });
});

function requireFixture(name: string): string {
  return readFileSync(fixture(name), "utf8");
}
