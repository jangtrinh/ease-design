/**
 * knowledge-lint core — the six checks as pure transforms over already-read
 * content. FS-free: every fixture is an in-memory KnowledgeLintInput.
 */
import { describe, expect, it } from "vitest";

import { lintKnowledge } from "../src/core/knowledge-lint.js";
import type { KnowledgeLintInput } from "../src/core/knowledge-lint.js";

/** A mutable view of the input so tests can tweak fixtures before linting. */
type MutableInput = Omit<KnowledgeLintInput, "files" | "mdContents" | "repoFiles"> & {
  files: string[];
  mdContents: Record<string, string>;
  repoFiles: string[];
};

/** A minimal-but-consistent knowledge core: one index row per md file, personas aligned. */
function consistent(overrides: Partial<MutableInput> = {}): MutableInput {
  const readme = [
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
  ].join("\n");
  const personaIndex = [
    "# Persona Index",
    "",
    "## 1. Lookup Table",
    "",
    "| Slug | Family | Keywords |",
    "|---|---|---|",
    "| `alpha-one` | family-a | k1, k2 |",
    "| `beta-two` | family-b | k3 |",
    "",
  ].join("\n");
  const familyA = "# Family A\n\n## Alpha One\n\n- **Slug:** `alpha-one`\n- **Family:** family-a\n";
  const familyB = "# Family B\n\n## Beta Two\n\n- **Slug:** `beta-two`\n- **Family:** family-b\n";
  const personasJson = JSON.stringify([
    { slug: "alpha-one", family: "family-a" },
    { slug: "beta-two", family: "family-b" },
  ]);
  const mdContents: Record<string, string> = {
    "README.md": readme,
    "taste-rubric.md": "# Taste\n",
    "persona-index.md": personaIndex,
    "personas/family-a.md": familyA,
    "personas/family-b.md": familyB,
  };
  const files = [
    "README.md",
    "taste-rubric.md",
    "persona-index.md",
    "personas/family-a.md",
    "personas/family-b.md",
    "personas/personas.json",
    "benchmarks/stripe--202607.dna.json",
  ];
  return {
    files,
    mdContents,
    personasJson,
    repoFiles: files.map((f) => `knowledge/${f}`),
    asOf: "202607",
    ...overrides,
  };
}

const ids = (input: KnowledgeLintInput): string[] => lintKnowledge(input).map((f) => f.checkId);

describe("knowledge-lint — passes on a consistent core", () => {
  it("returns zero findings", () => {
    expect(lintKnowledge(consistent())).toEqual([]);
  });
});

describe("knowledge-lint — index checks", () => {
  it("index-missing-row: a knowledge md with no table row", () => {
    const base = consistent();
    base.mdContents["orphan.md"] = "# Orphan\n";
    base.files.push("orphan.md");
    expect(ids(base)).toContain("index-missing-row");
  });

  it("index-dead-row: a File-column entry that matches no file", () => {
    const base = consistent();
    base.mdContents["README.md"] = base.mdContents["README.md"]!.replace(
      "| `taste-rubric.md` | The taste model |",
      "| `taste-rubric.md` | The taste model |\n| `ghost.md` | Nothing |",
    );
    expect(ids(base)).toContain("index-dead-row");
  });

  it("brace + glob + placeholder rows count as coverage", () => {
    const base = consistent();
    // deep-dive covered only by a brace list inside the Covers column
    base.mdContents["README.md"] = base.mdContents["README.md"]!.replace(
      "| `taste-rubric.md` | The taste model |",
      "| `taste-rubric.md` | See `sub/{a,b}.md` |",
    );
    base.mdContents["sub/a.md"] = "# A\n";
    base.mdContents["sub/b.md"] = "# B\n";
    base.files.push("sub/a.md", "sub/b.md");
    expect(ids(base)).not.toContain("index-missing-row");
  });
});

describe("knowledge-lint — persona-drift", () => {
  it("flags a slug present in the index but missing from personas.json", () => {
    const base = consistent();
    base.personasJson = JSON.stringify([{ slug: "alpha-one", family: "family-a" }]);
    expect(ids(base)).toContain("persona-drift");
  });

  it("flags a family that disagrees across sources", () => {
    const base = consistent();
    base.personasJson = JSON.stringify([
      { slug: "alpha-one", family: "WRONG" },
      { slug: "beta-two", family: "family-b" },
    ]);
    expect(ids(base)).toContain("persona-drift");
  });

  it("flags a missing/invalid personas.json", () => {
    const base = consistent({ personasJson: null });
    expect(ids(base)).toContain("persona-drift");
  });
});

describe("knowledge-lint — broken-xref", () => {
  it("flags a relative markdown link that does not resolve", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\nSee [gone](./does-not-exist.md).\n";
    expect(ids(base)).toContain("broken-xref");
  });

  it("resolves a link that points to a real sibling", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\nSee [idx](./persona-index.md).\n";
    expect(ids(base)).not.toContain("broken-xref");
  });
});

describe("knowledge-lint — benchmark-stale", () => {
  it("warns (not errors) when a benchmark is older than 6 months vs asOf", () => {
    const findings = lintKnowledge(consistent({ asOf: "202702" }));
    const stale = findings.filter((f) => f.checkId === "benchmark-stale");
    expect(stale.length).toBe(1);
    expect(stale[0]!.severity).toBe("warning");
  });

  it("does not warn within the 6-month window", () => {
    expect(ids(consistent({ asOf: "202612" }))).not.toContain("benchmark-stale");
  });
});

describe("knowledge-lint — provenance-bad-grammar", () => {
  it("flags a marker with no ref= attribute", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\n<!-- ease:source captured=\"202607\" -->\n";
    expect(ids(base)).toContain("provenance-bad-grammar");
  });

  it("flags a ref that points to a non-existent file", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] = "# Taste\n\n<!-- ease:source ref=\"knowledge/nope.json\" -->\n";
    expect(ids(base)).toContain("provenance-bad-grammar");
  });

  it("accepts a marker whose ref resolves to a real repo file", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\n<!-- ease:source ref=\"knowledge/benchmarks/stripe--202607.dna.json\" -->\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });

  it("ignores a marker shown inside a fenced code block (a documentation example)", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\n```\n<!-- ease:source ref=\"whatever\" -->\n```\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });

  it("ignores a marker shown inside an inline code span (docs mentioning the grammar)", () => {
    const base = consistent();
    base.mdContents["taste-rubric.md"] =
      "# Taste\n\nUse the `<!-- ease:source ref=… -->` marker to cite a source.\n";
    expect(ids(base)).not.toContain("provenance-bad-grammar");
  });
});
