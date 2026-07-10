/**
 * Knowledge intake — embed `knowledge/*.md` into the SAME index as the ledger corpus,
 * so one `recall query` can surface a relevant persona rule AND a past project insight.
 *
 * Two properties keep this honest:
 *  - Knowledge chunks are TIMELESS: they carry no event timestamp and never appear in
 *    the graph's decay map, so they rank on relevance alone (decay defaults to 1).
 *  - Their ids are namespaced `k:<relpath>#<n>` so they can never collide with a ledger
 *    event id (`e<N>`). The binary's `--rank-file` splice resolves ledger ids only; a
 *    knowledge hit is surfaced to the model through `recall query --text` instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { RecallItem } from "./store.ts";

/** Knowledge is not an event; it does not decay. */
const TIMELESS = "";

/** Split a section further when it would swamp a single embedding. */
const MAX_CHARS = 1200;

/** Recursively collect every .md file under a root, in sorted (deterministic) order. */
export function markdownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".md")) out.push(p);
    }
  };
  walk(root);
  return out;
}

/** Break a document into `## `-delimited sections, then cap each by paragraph. */
export function chunkMarkdown(text: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ") && current.length > 0) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current.join("\n").trim());

  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length === 0) continue;
    if (section.length <= MAX_CHARS) {
      chunks.push(section);
      continue;
    }
    let buf = "";
    for (const para of section.split(/\n{2,}/)) {
      if (buf.length > 0 && buf.length + para.length > MAX_CHARS) {
        chunks.push(buf.trim());
        buf = "";
      }
      buf += (buf.length > 0 ? "\n\n" : "") + para;
    }
    if (buf.trim().length > 0) chunks.push(buf.trim());
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Turn the knowledge core into indexable items. Ids are stable across runs, so a
 * re-index upserts in place; `entity` is the document, which lets the indexer purge a
 * file's stale chunks when it shrinks.
 */
export function knowledgeItems(knowledgeRoot: string): RecallItem[] {
  const items: RecallItem[] = [];
  for (const file of markdownFiles(knowledgeRoot)) {
    const rel = relative(knowledgeRoot, file).split("\\").join("/");
    const chunks = chunkMarkdown(readFileSync(file, "utf8"));
    chunks.forEach((text, i) => {
      items.push({
        id: `k:${rel}#${i}`,
        tier: "semantic",
        // Prefix the source doc so a retrieved chunk always carries its provenance.
        text: `[${rel}] ${text}`,
        refs: [],
        t: TIMELESS,
        source: "knowledge",
        entity: `doc:${rel}`,
      });
    });
  }
  return items;
}

/** True for a ledger event id (`e12`); knowledge ids (`k:…`) are not spliceable. */
export function isLedgerId(id: string): boolean {
  return /^e\d+$/.test(id);
}
