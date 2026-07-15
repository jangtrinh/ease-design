/**
 * `ui knowledge check` — command-layer behaviour through the CLI seam. Each test
 * scaffolds a throwaway repo root with a knowledge/ tree in tmp, so the command's
 * own IO (walk + read) is exercised end-to-end against the pure linter.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

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
  try { exitCode = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

interface Envelope { ok: boolean; data?: { findings: { checkId: string; severity: string }[]; errorCount: number; warningCount: number }; error?: { code: string } }
const parse = (s: string): Envelope => JSON.parse(s) as Envelope;
const checkIds = (r: { stdout: string }): string[] => (parse(r.stdout).data?.findings ?? []).map((f) => f.checkId);

let root: string;

/** Write one file under the tmp repo root, creating parent dirs. */
function write(rel: string, content: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}

/** Lay down a consistent knowledge/ core that passes every check. */
function scaffoldConsistent(): void {
  write("knowledge/README.md", [
    "# Knowledge",
    "",
    "## The files",
    "",
    "| File | Covers |",
    "|---|---|",
    "| `taste-rubric.md` | The taste model |",
    "| `persona-index.md` | Persona lookup |",
    "| `personas/<family>.md` | Persona DNA |",
    "| `benchmarks/*.dna.json` | Measured DNA |",
    "",
  ].join("\n"));
  write("knowledge/taste-rubric.md", "# Taste\n");
  write("knowledge/persona-index.md", [
    "# Persona Index", "", "## 1. Lookup Table", "",
    "| Slug | Family |", "|---|---|",
    "| `alpha-one` | family-a |", "",
  ].join("\n"));
  write("knowledge/personas/family-a.md", "# Family A\n\n## Alpha One\n\n- **Slug:** `alpha-one`\n- **Family:** family-a\n");
  write("knowledge/personas/personas.json", JSON.stringify([{ slug: "alpha-one", family: "family-a" }]));
  write("knowledge/benchmarks/stripe--202607.dna.json", "{}");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ease-knowledge-"));
});

describe("ui knowledge check", () => {
  it("passes on a consistent core (exit 0, 0 findings)", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(parse(r.stdout).data?.errorCount).toBe(0);
  });

  it("index-missing-row: an unindexed knowledge md (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/orphan.md", "# Orphan\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("index-missing-row");
  });

  it("index-dead-row: a README row pointing at a missing file (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/README.md", [
      "# Knowledge", "", "## The files", "",
      "| File | Covers |", "|---|---|",
      "| `taste-rubric.md` | ok |",
      "| `persona-index.md` | ok |",
      "| `personas/<family>.md` | ok |",
      "| `benchmarks/*.dna.json` | ok |",
      "| `ghost.md` | dead |", "",
    ].join("\n"));
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("index-dead-row");
  });

  it("broken-xref: a relative link that does not resolve (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/taste-rubric.md", "# Taste\n\nSee [gone](./nope.md).\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("broken-xref");
  });

  it("benchmark-stale: a warning (exit 0) under a future --as-of", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202702", "--json"]);
    expect(r.exitCode).toBe(0);
    const env = parse(r.stdout);
    expect(env.data?.warningCount).toBe(1);
    expect(env.data?.findings[0]?.checkId).toBe("benchmark-stale");
  });

  it("provenance-bad-grammar: a marker missing ref= (exit 1)", () => {
    scaffoldConsistent();
    write("knowledge/taste-rubric.md", "# Taste\n\n<!-- ease:source captured=\"202607\" -->\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(checkIds(r)).toContain("provenance-bad-grammar");
  });

  it("provenance: accepts a well-formed marker whose ref resolves", () => {
    scaffoldConsistent();
    write("knowledge/taste-rubric.md",
      "# Taste\n\n<!-- ease:source ref=\"knowledge/benchmarks/stripe--202607.dna.json\" -->\n");
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "202607", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(checkIds(r)).not.toContain("provenance-bad-grammar");
  });

  it("unknown-flag: rejected with UNKNOWN_FLAG", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--bogus", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("UNKNOWN_FLAG");
  });

  it("NO_KNOWLEDGE: no knowledge/ dir under --dir", () => {
    const r = capture(["knowledge", "check", "--dir", root, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("NO_KNOWLEDGE");
  });

  it("BAD_AS_OF: a non-YYYYMM --as-of", () => {
    scaffoldConsistent();
    const r = capture(["knowledge", "check", "--dir", root, "--as-of", "julyish", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(parse(r.stdout).error?.code).toBe("BAD_AS_OF");
  });
});
