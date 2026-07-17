/**
 * `ui scan` command — read-only design-signal detection + routing verdict.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import type { ScanResult } from "../src/core/project-scan.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

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

function initDs(tmp: string) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "landing for a gym",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
  ]);
}

interface ScanEnvelope {
  ok: boolean;
  command: string;
  data: ScanResult;
}

/** Run `ui scan --cwd <tmp> --json` and parse the envelope. */
function scanJson(tmp: string): ScanEnvelope {
  const r = capture(["scan", "--cwd", tmp, "--json"]);
  return JSON.parse(r.stdout) as ScanEnvelope;
}

describe("ui scan", () => {
  it("an empty directory yields verdict greenfield, exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const r = capture(["scan", "--cwd", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(
      'verdict: greenfield — empty project. Next: /ui:generate "<intent>"',
    );
  });

  it("next.js deps + a components dir with 3 .tsx files yields brownfield-code", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { next: "14" } }));
    const compDir = join(tmp, "src", "components");
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, "Button.tsx"), "export const Button = () => null;\n");
    writeFileSync(join(compDir, "Card.tsx"), "export const Card = () => null;\n");
    writeFileSync(join(compDir, "Modal.tsx"), "export const Modal = () => null;\n");

    const env = scanJson(tmp);
    expect(env.data.verdict).toBe("brownfield-code");
    expect(env.data.framework).toBe("next");
    const comp = env.data.componentDirs.find((d) => d.path.endsWith("components"));
    expect(comp).toBeDefined();
    expect(comp!.files).toBeGreaterThanOrEqual(3);
  });

  it("a root index.html + style.css yields verdict brownfield-html", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "index.html"), "<!doctype html><html><body>Hi</body></html>\n");
    writeFileSync(join(tmp, "style.css"), "body { margin: 0; }\n");

    const r = capture(["scan", "--cwd", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("verdict: brownfield-html — existing markup detected. Next: /ui:learn");

    const env = scanJson(tmp);
    expect(env.data.htmlFiles.length).toBeGreaterThanOrEqual(1);
    expect(env.data.htmlFiles[0]!.bytes).toBeGreaterThan(0);
    expect(env.data.cssFiles.length).toBeGreaterThanOrEqual(1);
    expect(env.data.cssFiles[0]!.bytes).toBeGreaterThan(0);
  });

  it("a directory with an initialized design system yields dsStatus present and verdict ds-present", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    initDs(tmp);

    const env = scanJson(tmp);
    expect(env.data.dsStatus).toBe("present");
    expect(env.data.verdict).toBe("ds-present");
  });

  it("excludes node_modules — html buried inside it is never counted", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const nmDir = join(tmp, "node_modules", "react");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "index.html"), "<html></html>\n");

    const env = scanJson(tmp);
    expect(env.data.htmlFiles).toEqual([]);
    expect(env.data.verdict).toBe("greenfield");
  });

  it("a root tailwind.config.ts is detected as the tailwind styling signal", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "tailwind.config.ts"), "export default {};\n");

    const env = scanJson(tmp);
    expect(env.data.styling).toContain("tailwind");
    expect(env.data.tailwindConfig).not.toBeNull();
    expect(env.data.tailwindConfig!.endsWith("tailwind.config.ts")).toBe(true);
  });

  it("is deterministic — two --json runs on the same fixture are byte-identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { vue: "3" } }));
    writeFileSync(join(tmp, "index.html"), "<html></html>\n");
    writeFileSync(join(tmp, "style.css"), "body {}\n");

    const a = capture(["scan", "--cwd", tmp, "--json"]);
    const b = capture(["scan", "--cwd", tmp, "--json"]);
    expect(a.stdout).toBe(b.stdout);
  });

  it("--json emits an envelope with ok, command, and data.verdict", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const env = scanJson(tmp);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("scan");
    expect(env.data.verdict).toBeDefined();
  });

  it("a stray positional is rejected as BAD_ARG", () => {
    const r = capture(["scan", "foo"]);
    expect(r.exitCode).toBe(1);
  });

  it("test_a_ui_behind_an_alphabetically_earlier_large_sibling_is_found", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    // "aaa-service" sorts before "zzz-ui". Its full recursive subtree (10 x 10
    // dirs x 50 files = 5000+ entries) exceeds MAX_ENTRIES on its own, so a
    // depth-first walk exhausts the budget entirely inside it and never even
    // starts "zzz-ui" — pinning the dana pathology (an early-alphabetical,
    // bushy sibling starves an alphabetically-later, shallow UI dir). BFS
    // visits "zzz-ui" (2 levels deep) long before the walk works its way that
    // deep into "aaa-service", so it survives the same eventual truncation.
    const aaaDir = join(tmp, "src", "aaa-service");
    mkdirSync(aaaDir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      const mid = join(aaaDir, `n${i}`);
      mkdirSync(mid);
      for (let j = 0; j < 10; j++) {
        const leaf = join(mid, `n${j}`);
        mkdirSync(leaf);
        for (let k = 0; k < 50; k++) {
          writeFileSync(join(leaf, `f${k}.txt`), "x");
        }
      }
    }
    const zzzComponents = join(tmp, "src", "zzz-ui", "components");
    mkdirSync(zzzComponents, { recursive: true });
    writeFileSync(join(zzzComponents, "Button.tsx"), "export const Button = () => null;\n");
    writeFileSync(join(zzzComponents, "Card.tsx"), "export const Card = () => null;\n");
    writeFileSync(join(zzzComponents, "Modal.tsx"), "export const Modal = () => null;\n");
    writeFileSync(join(tmp, "src", "zzz-ui", "zzz-tokens.css"), "body { margin: 0; }\n");

    const env = scanJson(tmp);
    const comp = env.data.componentDirs.find((d) => d.path.includes("zzz-ui"));
    expect(comp).toBeDefined();
    const css = env.data.cssFiles.find((f) => f.path.endsWith("zzz-tokens.css"));
    expect(css).toBeDefined();
  }, 20000);

  it("test_scan_is_byte_identical_across_runs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));
    const compDir = join(tmp, "src", "components");
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, "Button.tsx"), "export const Button = () => null;\n");
    writeFileSync(join(compDir, "Card.tsx"), "export const Card = () => null;\n");
    writeFileSync(join(compDir, "Modal.tsx"), "export const Modal = () => null;\n");
    writeFileSync(join(tmp, "src", "tokens.css"), "body { margin: 0; }\n");

    const a = capture(["scan", "--cwd", tmp, "--json"]);
    const b = capture(["scan", "--cwd", tmp, "--json"]);
    expect(a.stdout).toBe(b.stdout);
  });

  it("test_a_tree_over_the_cap_reports_truncated_true_and_visited", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const wide = join(tmp, "wide");
    mkdirSync(wide, { recursive: true });
    // MAX_ENTRIES is 4000 — a single directory with 4010 direct file children
    // exhausts the entry cap without needing any depth.
    for (let i = 0; i < 4010; i++) {
      writeFileSync(join(wide, `f-${i}.txt`), "x");
    }

    const env = scanJson(tmp);
    expect(env.data.truncated).toBe(true);
    expect(env.data.visited).toBe(4000);
  });

  it("test_a_tree_under_the_cap_reports_truncated_false", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "index.html"), "<html></html>\n");

    const env = scanJson(tmp);
    expect(env.data.truncated).toBe(false);
  });

  it("test_a_tree_over_max_depth_reports_truncated", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    // MAX_DEPTH is 6 — nest one directory deeper than that below the root.
    let deep = tmp;
    for (let i = 0; i < 8; i++) {
      deep = join(deep, `d${i}`);
    }
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "buried.css"), "body {}\n");

    const env = scanJson(tmp);
    expect(env.data.truncated).toBe(true);
  });

  it("test_truncated_does_not_change_any_existing_field_shape", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "index.html"), "<html></html>\n");
    writeFileSync(join(tmp, "style.css"), "body {}\n");

    const env = scanJson(tmp);
    expect(typeof env.data.framework === "string" || env.data.framework === null).toBe(true);
    expect(Array.isArray(env.data.styling)).toBe(true);
    expect(Array.isArray(env.data.cssFiles)).toBe(true);
    expect(Array.isArray(env.data.htmlFiles)).toBe(true);
    expect(Array.isArray(env.data.componentDirs)).toBe(true);
    expect(typeof env.data.dsStatus).toBe("string");
    expect(typeof env.data.verdict).toBe("string");
    expect(typeof env.data.truncated).toBe("boolean");
    expect(typeof env.data.visited).toBe("number");
  });

  it("test_component_dirs_carry_their_file_counts_and_a_stable_order", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    // Two legitimate UI roots, EaseUI-style — scan reports both, sorted by path;
    // it does not pick a winner (D3 — learn.md ranks by files count).
    const appComponents = join(tmp, "app", "src", "components");
    mkdirSync(appComponents, { recursive: true });
    writeFileSync(join(appComponents, "A.tsx"), "export const A = () => null;\n");
    writeFileSync(join(appComponents, "B.tsx"), "export const B = () => null;\n");
    writeFileSync(join(appComponents, "C.tsx"), "export const C = () => null;\n");
    writeFileSync(join(appComponents, "D.tsx"), "export const D = () => null;\n");

    const frontpageComponents = join(tmp, "frontpage", "app", "src", "components");
    mkdirSync(frontpageComponents, { recursive: true });
    writeFileSync(join(frontpageComponents, "A.tsx"), "export const A = () => null;\n");
    writeFileSync(join(frontpageComponents, "B.tsx"), "export const B = () => null;\n");
    writeFileSync(join(frontpageComponents, "C.tsx"), "export const C = () => null;\n");

    const env = scanJson(tmp);
    expect(env.data.componentDirs.length).toBe(2);
    const app = env.data.componentDirs.find((d) => d.path === "app/src/components");
    const frontpage = env.data.componentDirs.find(
      (d) => d.path === "frontpage/app/src/components",
    );
    expect(app?.files).toBe(4);
    expect(frontpage?.files).toBe(3);
    // Stable order: sorted alphabetically by path, "app/..." before "frontpage/...".
    expect(env.data.componentDirs.map((d) => d.path)).toEqual([
      "app/src/components",
      "frontpage/app/src/components",
    ]);
  });
});
