/**
 * Audit family: ref-integrity
 *
 * Walks every `"{group.name}"` reference string in the YAML and asserts
 * it resolves to a defined node. Catches dangling refs that ship a
 * DESIGN.md another tool can't read.
 */
import { walkYamlLeaves, walkYamlPaths } from "./designmd-parser.js";
import type { DesignMdDocument } from "./designmd-parser.js";
import type { AuditRow } from "./designmd-audit-types.js";

const REF_RE = /\{([a-zA-Z0-9_.-]+)\}/g;

export function auditRefIntegrity(doc: DesignMdDocument): AuditRow[] {
  const rows: AuditRow[] = [];

  const definedPaths = new Set<string>();
  for (const path of walkYamlPaths(doc.yamlTree)) {
    definedPaths.add(path);
  }

  const unresolved: { path: string; ref: string }[] = [];
  for (const [path, value] of walkYamlLeaves(doc.yamlTree)) {
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(value)) !== null) {
      const refPath = m[1]!;
      if (!definedPaths.has(refPath)) {
        unresolved.push({ path, ref: refPath });
      }
    }
  }

  if (unresolved.length === 0) {
    rows.push({
      family: "ref-integrity",
      rule: "all-refs-resolve",
      status: "PASS",
      detail: "every {group.name} reference resolves",
    });
  } else {
    rows.push({
      family: "ref-integrity",
      rule: "all-refs-resolve",
      status: "FAIL",
      detail: `${unresolved.length} unresolved reference(s): ${unresolved.slice(0, 3).map(u => `${u.path} → {${u.ref}}`).join("; ")}`,
      suggestedFix: "either define the target token under the matching group, or change the reference to point at an existing token",
    });
  }

  return rows;
}
