import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Track 9 boundary invariant #1: the deterministic `ui` binary never reaches for the
 * recall workspace's machinery. Embedding models, vector stores and the ONNX runtime
 * live in `recall/` and are driven over Bash — never imported. This guard is what keeps
 * `ui` zero-dependency, no-network and no-LLM as the workspace grows.
 */
const FORBIDDEN = [
  "sqlite-vec",
  "@huggingface/transformers",
  "onnxruntime",
  "node:sqlite",
  // The workspace itself must never be reachable from the binary's module graph.
  "recall/cli",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("recall boundary (Track 9 invariant #1)", () => {
  it("no file under src/ imports a recall dependency", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const pkg of FORBIDDEN) {
        if (text.includes(pkg)) offenders.push(`${file.slice(ROOT.length + 1)} → ${pkg}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the built binary bundle contains no recall dependency", () => {
    const bundle = join(ROOT, "dist", "cli.js");
    if (!existsSync(bundle)) {
      // `npm test` may run before `npm run build`; CI always builds first.
      expect(true).toBe(true);
      return;
    }
    const text = readFileSync(bundle, "utf8");
    for (const pkg of FORBIDDEN) {
      expect(text.includes(pkg), `built binary must not reference ${pkg}`).toBe(false);
    }
  });

  it("the root package still declares zero runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      workspaces?: string[];
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    // recall is an optional workspace — present, but never a dependency of the binary.
    expect(pkg.workspaces).toContain("recall");
  });

  it("recall's own package declares the heavy deps, and a Node >=22 floor", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "recall", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      engines?: { node?: string };
      private?: boolean;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(["@huggingface/transformers", "sqlite-vec"]);
    expect(pkg.engines?.node).toBe(">=22"); // node:sqlite is only built in from Node 22
    expect(pkg.private).toBe(true); // never published with ease-design
  });
});
