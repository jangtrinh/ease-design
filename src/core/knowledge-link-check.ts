/**
 * The two link-integrity checks over knowledge markdown:
 *
 *   broken-xref            a relative markdown link `[t](path)` between knowledge
 *                          files that resolves to nothing
 *   provenance-bad-grammar an `<!-- ease:source … -->` marker missing `ref=` or
 *                          whose `ref` points to a non-existent repo file
 *
 * Both are pure transforms over already-read content. The provenance grammar is
 * defined in knowledge/authoring-standard.md; documentation examples of the
 * marker live inside ``` fences, which the scanner skips so a shown example is
 * never linted as a live marker.
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";

/** Resolve a `./a/../b` posix path against a directory, returning a knowledge-relative path. */
function resolvePosix(fromDir: string, target: string): string {
  const base = fromDir === "" ? [] : fromDir.split("/");
  const stack = target.startsWith("/") ? [] : [...base];
  for (const seg of target.replace(/^\//, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

const dirOf = (rel: string): string => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/** broken-xref: relative markdown links between knowledge files that don't resolve. */
export function xrefChecks(
  mdContents: Readonly<Record<string, string>>,
  files: readonly string[],
): KnowledgeFinding[] {
  const known = new Set(files);
  const findings: KnowledgeFinding[] = [];
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const rel of Object.keys(mdContents).sort()) {
    const content = mdContents[rel] ?? "";
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(content)) !== null) {
      const raw = m[1] ?? "";
      if (/^[a-z]+:/i.test(raw) || raw.startsWith("#") || raw.startsWith("//")) continue; // scheme / anchor
      const target = (raw.split("#")[0] ?? "").split("?")[0] ?? "";
      if (target === "") continue;
      const resolved = resolvePosix(dirOf(rel), target);
      if (!known.has(resolved)) {
        findings.push({
          checkId: "broken-xref",
          severity: "error",
          message: `'${rel}' links to '${raw}', which does not resolve to a knowledge file`,
        });
      }
    }
  }
  return findings;
}

/**
 * Blank out every code span — ``` fenced blocks AND inline `…` spans — so an
 * ease:source marker shown as a documentation example (in any code span) is never
 * linted as a live marker. A real provenance marker is a raw HTML comment in the
 * markdown body, never inside a code span.
 */
function stripCode(content: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; out.push(""); continue; }
    out.push(inFence ? "" : line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

/** provenance-bad-grammar: `<!-- ease:source … -->` markers missing/with a dead ref. */
export function provenanceChecks(
  mdContents: Readonly<Record<string, string>>,
  repoFiles: readonly string[],
): KnowledgeFinding[] {
  const known = new Set(repoFiles);
  const findings: KnowledgeFinding[] = [];
  const markerRe = /<!--\s*ease:source\b([^>]*?)-->/g;
  for (const rel of Object.keys(mdContents).sort()) {
    const scannable = stripCode(mdContents[rel] ?? "");
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(scannable)) !== null) {
      const attrs = m[1] ?? "";
      const ref = attrs.match(/\bref="([^"]*)"/);
      if (ref === null) {
        findings.push({
          checkId: "provenance-bad-grammar",
          severity: "error",
          message: `'${rel}' has an ease:source marker with no ref="…" attribute`,
        });
        continue;
      }
      const target = ref[1] ?? "";
      if (target === "" || !known.has(target)) {
        findings.push({
          checkId: "provenance-bad-grammar",
          severity: "error",
          message: `'${rel}' ease:source ref="${target}" points to a file that does not exist`,
        });
      }
    }
  }
  return findings;
}
