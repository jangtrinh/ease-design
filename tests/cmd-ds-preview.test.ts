/**
 * `ui ds preview [--dir] [--out] [--json]` — E2E over the real CLI (`run()`).
 *
 * Generates a self-contained specimen.html from the compiled DS (tokens + registry).
 * The load-bearing guarantee: the machine-generated page must clear the SAME gates the
 * hand-authored one did — so the tests run the validate-layout / a11y-lint / content-lint
 * CORE linters on the emitted file and require 0 errors. Plus determinism (byte-identical
 * on a double run) and the --bare foundations-only path.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { lintLayout } from "../src/core/layout-lint.js";
import { lintA11y } from "../src/core/a11y-lint.js";
import { lintTaste } from "../src/core/taste-lint.js";
import {
  checkLoremIpsum, checkPlaceholderCopy, checkClickHereLink, checkErrorCodeAlone,
  checkExclamationOverload, checkInsensitiveTerms, checkPluralSHack, checkTextInImage, checkAllCapsShout,
} from "../src/core/content-checks.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

/** The 27 kit component names a fresh `ds init` registers (P2 + wave C + wave D). */
const KIT_NAMES = [
  "Control/Button", "Control/Checkbox", "Control/Combobox", "Control/Input",
  "Control/Radio", "Control/Select", "Control/Switch", "Control/Textarea",
  "Data/Table",
  "Display/Alert", "Display/Avatar", "Display/Badge", "Display/Card",
  "Display/Kbd", "Display/Progress", "Display/Separator", "Display/Skeleton",
  "Display/Toast",
  "Form/Field",
  "Overlay/Dialog", "Overlay/DropdownMenu", "Overlay/Popover", "Overlay/Tooltip",
  "Structure/Accordion", "Structure/Breadcrumb", "Structure/Pagination", "Structure/Tabs",
];

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

function initKit(dir: string, bare = false): void {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument",
    "--dir", dir, "--persona-data", PERSONA_DATA,
    ...(bare ? ["--bare"] : []),
  ]);
}

/** Count content-lint ERROR-severity findings (mirrors the content-lint command's check set). */
function contentErrors(html: string): number {
  const checks = [
    checkLoremIpsum, checkPlaceholderCopy, checkClickHereLink, checkErrorCodeAlone,
    checkExclamationOverload, checkInsensitiveTerms, checkPluralSHack, checkTextInImage, checkAllCapsShout,
  ];
  let errs = 0;
  for (const c of checks) for (const f of c(html)) if (f.severity === "error") errs++;
  return errs;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-preview-"));
});

describe("ui ds preview", () => {
  it("generates design/preview/specimen.html from a fresh kit DS", () => {
    initKit(dir);
    const r = capture(["ds", "preview", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { out: string; components: number; pairs: number; bytes: number };
    expect(data.out).toBe(join(dir, "design", "preview", "specimen.html"));
    expect(data.components).toBe(27);
    expect(data.pairs).toBeGreaterThan(0);
    expect(data.bytes).toBeGreaterThan(0);
    expect(readFileSync(data.out).length).toBe(data.bytes); // Buffer.length = UTF-8 byte count
  });

  it("the page embeds :root tokens and every component name", () => {
    initKit(dir);
    capture(["ds", "preview", "--dir", dir]);
    const html = readFileSync(join(dir, "design", "preview", "specimen.html"), "utf8");
    expect(html).toContain("--color-primary");
    expect(html).toContain(":root {");
    for (const name of KIT_NAMES) expect(html, `missing ${name}`).toContain(name);
  });

  it("the generated page passes validate-layout / a11y-lint / content-lint with 0 errors", () => {
    initKit(dir);
    capture(["ds", "preview", "--dir", dir]);
    const html = readFileSync(join(dir, "design", "preview", "specimen.html"), "utf8");
    expect(lintLayout(html).errorCount, "layout errors").toBe(0);
    expect(lintA11y(html).errorCount, "a11y errors").toBe(0);
    expect(contentErrors(html), "content errors").toBe(0);
    // Dogfood: the first real-DS preview shipped an unguarded spinner animation — taste-lint
    // (animation-no-reduced-motion) is part of the generated page's own gate from now on.
    expect(lintTaste(html).errorCount, "taste errors").toBe(0);
  });

  it("is deterministic: two runs of the same DS are byte-identical", () => {
    initKit(dir);
    capture(["ds", "preview", "--dir", dir]);
    const first = readFileSync(join(dir, "design", "preview", "specimen.html"), "utf8");
    capture(["ds", "preview", "--dir", dir]);
    const second = readFileSync(join(dir, "design", "preview", "specimen.html"), "utf8");
    expect(second).toBe(first);
  });

  it("--out overrides the output path", () => {
    initKit(dir);
    const out = join(dir, "custom-specimen.html");
    const r = capture(["ds", "preview", "--dir", dir, "--out", out, "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.out).toBe(out);
    expect(readFileSync(out, "utf8")).toContain("Design System Specimen");
  });

  it("--bare DS renders foundations but records no components", () => {
    initKit(dir, true);
    capture(["ds", "preview", "--dir", dir]);
    const html = readFileSync(join(dir, "design", "preview", "specimen.html"), "utf8");
    expect(html).toContain("--color-primary");         // foundations still render
    expect(html).toContain("No components registered"); // components section note
    expect(lintLayout(html).errorCount).toBe(0);
    expect(lintA11y(html).errorCount).toBe(0);
    expect(contentErrors(html)).toBe(0);
  });

  it("missing DS → DS_NOT_FOUND", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-preview-empty-"));
    const r = capture(["ds", "preview", "--dir", empty, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_NOT_FOUND");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    initKit(dir);
    const r = capture(["ds", "preview", "--dir", dir, "--nope", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("UNKNOWN_FLAG");
  });
});
