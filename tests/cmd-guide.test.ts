import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

// In-process CLI capture (mirrors cmd-validate-layout.test.ts).
function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

describe("ui guide — designer on-ramp", () => {
  it("exits 0 and shows the plain-language workflow in text mode", () => {
    const { code, out } = captureRun(["guide"]);
    expect(code).toBe(0);
    expect(out).toContain("what you can do");
    expect(out).toContain("/ui:generate");
    expect(out).toContain("/ui:iterate");
    // Plain-language framing, not dev jargon.
    expect(out).toContain("pick a result by eye");
  });

  it("separates the workflow from the under-the-hood engine", () => {
    const { out } = captureRun(["guide"]);
    expect(out).toContain("The workflow");
    expect(out).toContain("Under the hood");
    // The deterministic plumbing is named as engine, not as a designer action.
    expect(out).toContain("run automatically");
  });

  it("emits a structured workflow map in --json mode", () => {
    const { code, out } = captureRun(["guide", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { workflow: { want: string; command: string; detail: string }[]; quality: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.workflow.length).toBeGreaterThanOrEqual(9);
    // First step is the entry point.
    expect(json.data.workflow[0]?.command).toContain("/ui:generate");
    // Every step is fully populated (no placeholder gaps).
    for (const step of json.data.workflow) {
      expect(step.want.length).toBeGreaterThan(0);
      expect(step.command).toContain("/ui:");
      expect(step.detail.length).toBeGreaterThan(0);
    }
    expect(json.data.quality).toContain("taste");
  });

  it("covers all nine /ui:* workflows", () => {
    const { out } = captureRun(["guide", "--json"]);
    const json = JSON.parse(out) as { data: { workflow: { command: string }[] } };
    const cmds = json.data.workflow.map((s) => s.command).join(" ");
    for (const verb of ["generate", "iterate", "refine", "redesign", "from-ref", "from-url", "figma", "slides", "extract"]) {
      expect(cmds).toContain(`/ui:${verb}`);
    }
  });
});

describe("root help — discoverability", () => {
  it("points newcomers at `ui guide`", () => {
    const { code, out } = captureRun(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("ui guide");
    expect(out).toContain("New here?");
  });

  it("lists guide as a registered command", () => {
    const { out } = captureRun(["--help"]);
    expect(out).toContain("guide");
    expect(out).toContain("start here if you're new");
  });
});
