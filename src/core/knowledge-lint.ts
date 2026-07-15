/**
 * The knowledge-core linter — the "unit tier" for knowledge/: free, runs on
 * every commit, no model call. It answers one question deterministically: has
 * the knowledge core drifted from its own conventions?
 *
 * Six checks (findings-linter shape, per constitution Art II):
 *   index-missing-row       error    a knowledge/*.md with no README table row
 *   index-dead-row          error    a table row pointing to a missing file
 *   persona-drift           error    index ↔ family md ↔ personas.json disagree
 *   broken-xref             error    a relative md link that doesn't resolve
 *   benchmark-stale         warning  a benchmark DNA file older than 6 months
 *   provenance-bad-grammar  error    an ease:source marker missing/with a dead ref
 *
 * This module is FS-FREE: it receives already-read content and returns findings,
 * so the command layer owns all IO and the checks stay pure and testable.
 */
import { indexChecks } from "./knowledge-index-check.js";
import { personaChecks } from "./knowledge-persona-check.js";
import { xrefChecks, provenanceChecks } from "./knowledge-link-check.js";

export interface KnowledgeFinding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
}

export interface KnowledgeLintInput {
  /** Every existing knowledge-relative file path (posix separators), any extension. */
  files: readonly string[];
  /** Knowledge-relative path → content, for every `.md` file under knowledge/ (incl READMEs). */
  mdContents: Readonly<Record<string, string>>;
  /** Raw personas/personas.json bytes, or null when missing/unreadable. */
  personasJson: string | null;
  /** Repo-relative paths (knowledge/**, references/**) an ease:source ref may target. */
  repoFiles: readonly string[];
  /** Staleness reference month, `YYYYMM`. */
  asOf: string;
}

/** Months from a `YYYYMM` string to the asOf month; null when either is malformed. */
function monthsBetween(fileYm: string, asOf: string): number | null {
  const parse = (s: string): number | null => {
    const m = /^(\d{4})(\d{2})$/.exec(s);
    if (m === null) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return y * 12 + (mo - 1);
  };
  const a = parse(fileYm);
  const b = parse(asOf);
  if (a === null || b === null) return null;
  return b - a;
}

const STALE_MONTHS = 6;

/** benchmark-stale: benchmarks/<slug>--<YYYYMM>.dna.json older than 6 months vs asOf. */
function benchmarkChecks(files: readonly string[], asOf: string): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  for (const rel of files) {
    const m = /(?:^|\/)benchmarks\/[^/]+--(\d{6})\.dna\.json$/.exec(rel);
    if (m === null || m[1] === undefined) continue;
    const age = monthsBetween(m[1], asOf);
    if (age !== null && age > STALE_MONTHS) {
      findings.push({
        checkId: "benchmark-stale",
        severity: "warning",
        message: `'${rel}' is ${age} months old (captured ${m[1]}, > ${STALE_MONTHS} months as of ${asOf}) — re-capture its DNA`,
      });
    }
  }
  return findings;
}

/** Sort: errors before warnings, then by checkId, then by message — deterministic. */
function sortFindings(findings: KnowledgeFinding[]): KnowledgeFinding[] {
  return [...findings].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.checkId.localeCompare(b.checkId) ||
      a.message.localeCompare(b.message),
  );
}

/** Only the persona family markdown files (personas/*.md, excluding any README). */
function personaFiles(mdContents: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, content] of Object.entries(mdContents)) {
    if (/^personas\/[^/]+\.md$/.test(rel) && !/README\.md$/.test(rel)) out[rel] = content;
  }
  return out;
}

/** Run all six checks over pre-read knowledge content. */
export function lintKnowledge(input: KnowledgeLintInput): KnowledgeFinding[] {
  const readme = input.mdContents["README.md"] ?? "";
  const findings: KnowledgeFinding[] = [
    ...indexChecks(readme, input.files),
    ...personaChecks(input.mdContents["persona-index.md"], personaFiles(input.mdContents), input.personasJson),
    ...xrefChecks(input.mdContents, input.files),
    ...benchmarkChecks(input.files, input.asOf),
    ...provenanceChecks(input.mdContents, input.repoFiles),
  ];
  return sortFindings(findings);
}
