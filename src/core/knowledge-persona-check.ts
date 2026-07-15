/**
 * persona-drift — the persona library has THREE representations that must agree
 * on which personas exist and what family each belongs to:
 *
 *   persona-index.md   §1 lookup table   (`| `slug` | family | … |`)
 *   personas/<f>.md    per-family blocks  (`- **Slug:** `slug`` + `- **Family:** family`)
 *   personas.json      compiled array     ({ slug, family, … })
 *
 * Any slug present in one source but absent from another, or a family that
 * disagrees across sources, is drift — an error. Pure transform; mirrors the
 * identity fields of scripts/derive-personas-json.mjs (slug + family only —
 * the numeric DNA lives solely in the JSON and is out of scope here).
 */
import type { KnowledgeFinding } from "./knowledge-lint.js";

type SlugFamily = Map<string, string>;

/** Slug→family from the persona-index.md §1 table rows (`| `slug` | family | …`). */
function parseIndex(indexMd: string): SlugFamily {
  const out: SlugFamily = new Map();
  for (const line of indexMd.split("\n")) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|\s*([a-z0-9-]+)\s*\|/);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2]);
  }
  return out;
}

/** Slug→family from every persona block across the family markdown files. */
function parseMarkdown(personaFiles: Record<string, string>): SlugFamily {
  const out: SlugFamily = new Map();
  for (const content of Object.values(personaFiles)) {
    for (const block of content.split(/^## /m).slice(1)) {
      const slug = block.match(/^-\s+\*\*Slug:\*\*\s+`([^`]+)`/m);
      const family = block.match(/^-\s+\*\*Family:\*\*\s+(\S+)/m);
      if (slug !== null && slug[1] !== undefined) {
        out.set(slug[1], family !== null && family[1] !== undefined ? family[1].trim() : "");
      }
    }
  }
  return out;
}

/** Slug→family from personas.json, or null when it is missing / invalid JSON. */
function parseJson(raw: string | null): SlugFamily | null {
  if (raw === null) return null;
  let arr: unknown;
  try { arr = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const out: SlugFamily = new Map();
  for (const p of arr) {
    if (typeof p === "object" && p !== null) {
      const { slug, family } = p as { slug?: unknown; family?: unknown };
      if (typeof slug === "string") out.set(slug, typeof family === "string" ? family : "");
    }
  }
  return out;
}

export function personaChecks(
  indexMd: string | undefined,
  personaFiles: Record<string, string>,
  personasJson: string | null,
): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  const err = (message: string): void => { findings.push({ checkId: "persona-drift", severity: "error", message }); };

  if (indexMd === undefined) { err("persona-index.md is missing — cannot cross-check the persona library"); return findings; }
  const json = parseJson(personasJson);
  if (json === null) { err("personas/personas.json is missing or not valid JSON — cannot cross-check the persona library"); return findings; }

  const index = parseIndex(indexMd);
  const md = parseMarkdown(personaFiles);

  const sources: { name: string; map: SlugFamily }[] = [
    { name: "persona-index.md", map: index },
    { name: "personas/*.md", map: md },
    { name: "personas.json", map: json },
  ];

  const allSlugs = new Set<string>([...index.keys(), ...md.keys(), ...json.keys()]);
  for (const slug of [...allSlugs].sort()) {
    const missing = sources.filter((s) => !s.map.has(slug)).map((s) => s.name);
    if (missing.length > 0) {
      const present = sources.filter((s) => s.map.has(slug)).map((s) => s.name);
      err(`persona '${slug}' is in ${present.join(", ")} but missing from ${missing.join(", ")}`);
      continue;
    }
    const families = new Set(sources.map((s) => s.map.get(slug)));
    if (families.size > 1) {
      const detail = sources.map((s) => `${s.name}='${s.map.get(slug)}'`).join(", ");
      err(`persona '${slug}' has a disagreeing family across sources: ${detail}`);
    }
  }
  return findings;
}
