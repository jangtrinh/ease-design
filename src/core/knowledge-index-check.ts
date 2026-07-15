/**
 * Knowledge-index checks — the README `## The files` table is the map of the
 * knowledge core; these two checks keep the map and the territory in sync:
 *
 *   index-missing-row  a knowledge/*.md file that no table cell references
 *   index-dead-row     a File-column entry that resolves to zero real files
 *
 * Table cells reference files as backtick code spans, and the real index uses
 * three pattern shapes the matcher understands: a literal path
 * (`taste-rubric.md`), a `*` glob (`benchmarks/*.dna.json`), a `<seg>`
 * placeholder for one path segment (`personas/<family>.md`), and `{a,b,c}`
 * brace lists (`figma-craft/{layout-mastery,visual-craft}.md`). Pure transform.
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";

/** A parsed markdown table row: its cells, trimmed, without the outer pipes. */
type TableRow = string[];

/** Expand every `{a,b,c}` group in a token into the cartesian list of tokens. */
function expandBraces(token: string): string[] {
  const m = token.match(/\{([^{}]+)\}/);
  if (m === null) return [token];
  const [whole, inner] = m;
  const options = (inner ?? "").split(",");
  const out: string[] = [];
  for (const opt of options) {
    const replaced = token.replace(whole, opt.trim());
    out.push(...expandBraces(replaced));
  }
  return out;
}

/** Turn a (brace-free) pattern token into an anchored regex: `*`→segment-glob, `<x>`→one segment. */
function tokenToRegex(token: string): RegExp {
  let re = "";
  for (let i = 0; i < token.length; i++) {
    const c = token[i] ?? "";
    if (c === "*") { re += "[^/]*"; continue; }
    if (c === "<") {
      const close = token.indexOf(">", i);
      if (close !== -1) { re += "[^/]+"; i = close; continue; }
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** All knowledge-relative files a single reference token matches. */
export function matchFiles(token: string, files: readonly string[]): string[] {
  const out: string[] = [];
  for (const expanded of expandBraces(token)) {
    const re = tokenToRegex(expanded);
    for (const f of files) if (re.test(f)) out.push(f);
  }
  return out;
}

/** True when a code-span token names a file (has a knowledge extension or a path segment). */
export function isPathLike(token: string): boolean {
  return token.includes("/") || /\.(md|json)$/.test(token) || token.includes("*");
}

/** Backtick code-span contents inside one cell. */
function codeSpans(cell: string): string[] {
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

/**
 * Parse the data rows of the `## The files` table. Returns [] when the heading
 * or a table under it is absent (an empty index makes every file "missing",
 * which is the honest signal).
 */
export function parseFilesTable(readme: string): TableRow[] {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => /^##\s+The files\b/.test(l));
  if (start === -1) return [];
  const rows: TableRow[] = [];
  let sawSeparator = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s/.test(line)) break; // next section ends the table region
    const t = line.trim();
    if (!t.startsWith("|")) { if (rows.length > 0 || sawSeparator) break; else continue; }
    if (/^\|[\s:|-]+\|?$/.test(t)) { sawSeparator = true; continue; } // separator row
    const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    // Skip the header row (first non-separator row before the separator).
    if (!sawSeparator) continue;
    rows.push(cells);
  }
  return rows;
}

/** Every knowledge file referenced by any cell of any row (the coverage set). */
function coveredFiles(rows: TableRow[], files: readonly string[]): Set<string> {
  const covered = new Set<string>();
  for (const row of rows) {
    for (const cell of row) {
      for (const span of codeSpans(cell)) {
        if (!isPathLike(span)) continue;
        for (const f of matchFiles(span, files)) covered.add(f);
      }
    }
  }
  return covered;
}

const isReadme = (rel: string): boolean => /(^|\/)README\.md$/.test(rel);

/** index-missing-row + index-dead-row findings for the knowledge core. */
export function indexChecks(readme: string, files: readonly string[]): KnowledgeFinding[] {
  const rows = parseFilesTable(readme);
  const findings: KnowledgeFinding[] = [];

  // index-dead-row: a File-column (first cell) reference matching zero files.
  for (const row of rows) {
    const fileCell = row[0] ?? "";
    for (const span of codeSpans(fileCell)) {
      if (!isPathLike(span)) continue;
      if (matchFiles(span, files).length === 0) {
        findings.push({
          checkId: "index-dead-row",
          severity: "error",
          message: `README '## The files' row for '${span}' points to a file that does not exist`,
        });
      }
    }
  }

  // index-missing-row: a knowledge/*.md (not a README) no table cell references.
  const covered = coveredFiles(rows, files);
  for (const rel of files) {
    if (!rel.endsWith(".md") || isReadme(rel)) continue;
    if (!covered.has(rel)) {
      findings.push({
        checkId: "index-missing-row",
        severity: "error",
        message: `knowledge file '${rel}' has no row in the '## The files' table of knowledge/README.md`,
      });
    }
  }
  return findings;
}
