#!/usr/bin/env node
/**
 * derive-personas-json.mjs
 *
 * Extracts deterministic persona fields from Markdown family files and verifies
 * that knowledge/personas/personas.json is consistent with them.
 *
 * Fields extracted deterministically from the Markdown structure:
 *   slug, family (inferred from filename), colorMode, density, uiTypes, keywords,
 *   trending, and antiPatterns (from "Avoid list:" lines, which may span 2–3 lines).
 *
 * Numeric values (hex colors, spacing, radius, font weights) are not present in the
 * Markdown in parseable structured form — they live only in the JSON.
 *
 * Exit 0: all checks pass.
 * Exit 1: discrepancies found (prints details to stderr).
 *
 * Usage:
 *   node scripts/derive-personas-json.mjs          # verify only
 *   node scripts/derive-personas-json.mjs --fix    # write antiPatterns back to JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, "..", "knowledge", "personas");
const PERSONAS_JSON = join(KNOWLEDGE_DIR, "personas.json");

const FIX_MODE = process.argv.includes("--fix");

// ─── Markdown parsers ─────────────────────────────────────────────────────────

/** Extract the family slug from a filename (e.g. "material-surface.md" → "material-surface"). */
function familyFromFile(filename) {
  return filename.replace(/\.md$/, "");
}

/**
 * Parse "**Avoid list:** item1; item2;\nitem3; item4." which may wrap across
 * multiple lines. We collect the first line plus any immediately following lines
 * that don't start a new paragraph (non-empty, no leading '#' or '-' or '**').
 * Returns string[].
 */
function parseAvoidList(block) {
  // Find the "**Avoid list:**" line and its index in the block
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.includes("**Avoid list:**")) continue;

    // Gather this line plus continuation lines (non-empty, not a new structural element)
    let combined = line;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "" || next.startsWith("#") || next.startsWith("-") ||
          next.startsWith("**") || next.startsWith("|") || next.startsWith(">")) {
        break;
      }
      combined += " " + next.trim();
    }

    // Strip the label prefix
    const afterLabel = combined.replace(/.*\*\*Avoid list:\*\*\s*/, "");
    // Split on ";" and clean up each entry
    return afterLabel
      .split(";")
      .map((s) => s.replace(/\.$/, "").trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Parse a single persona block from Markdown text.
 * Returns null if the block doesn't contain a Slug line.
 */
function parsePersonaBlock(block, family) {
  const slugMatch = block.match(/^-\s+\*\*Slug:\*\*\s+`([^`]+)`/m);
  if (!slugMatch) return null;
  const slug = slugMatch[1];

  const colorModeMatch = block.match(/^-\s+\*\*Color mode:\*\*\s+(\S+)/m);
  const colorMode = colorModeMatch ? colorModeMatch[1].trim() : null;

  const densityMatch = block.match(/^-\s+\*\*Density:\*\*\s+(\S+)/m);
  const density = densityMatch ? densityMatch[1].trim() : null;

  const trendingMatch = block.match(/^-\s+\*\*Trending:\*\*\s+(\S+)/m);
  const trending = trendingMatch ? trendingMatch[1].trim().toLowerCase() === "yes" : false;

  const uiTypesMatch = block.match(/^-\s+\*\*UI types:\*\*\s+(.+)$/m);
  const uiTypes = uiTypesMatch
    ? uiTypesMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const keywordsMatch = block.match(/^-\s+\*\*Keywords:\*\*\s+(.+)$/m);
  const keywords = keywordsMatch
    ? keywordsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const antiPatterns = parseAvoidList(block);

  return { slug, family, colorMode, density, trending, uiTypes, keywords, antiPatterns };
}

/** Parse all persona blocks from a Markdown family file. */
function parseMarkdownFile(content, family) {
  // Split on "## " headings (but not the top-level "# Family" heading)
  const blocks = content.split(/^## /m).slice(1);
  return blocks.map((b) => parsePersonaBlock("## " + b, family)).filter(Boolean);
}

// ─── Load data ────────────────────────────────────────────────────────────────

const MD_FILES = [
  "editorial-minimal.md",
  "functional-saas.md",
  "graphic-modernist.md",
  "immersive-cinematic.md",
  "material-surface.md",
  "product-marketing.md",
  "retro-digital.md",
];

const mdPersonas = [];
for (const filename of MD_FILES) {
  const family = familyFromFile(filename);
  const content = readFileSync(join(KNOWLEDGE_DIR, filename), "utf8");
  const personas = parseMarkdownFile(content, family);
  mdPersonas.push(...personas);
}

const jsonPersonas = JSON.parse(readFileSync(PERSONAS_JSON, "utf8"));

// ─── Verification ─────────────────────────────────────────────────────────────

let errors = 0;
const fixes = [];

// Build lookup map from slug → record
const mdBySlug = new Map(mdPersonas.map((p) => [p.slug, p]));
const jsonBySlug = new Map(jsonPersonas.map((p) => [p.slug, p]));

// Check every MD persona appears in JSON
for (const md of mdPersonas) {
  if (!jsonBySlug.has(md.slug)) {
    process.stderr.write(`ERROR: persona '${md.slug}' found in Markdown but missing from personas.json\n`);
    errors++;
    continue;
  }
  const json = jsonBySlug.get(md.slug);

  // family
  if (json.family !== md.family) {
    process.stderr.write(`ERROR [${md.slug}] family: JSON='${json.family}', MD='${md.family}'\n`);
    errors++;
  }

  // colorMode
  if (md.colorMode && json.colorMode !== md.colorMode) {
    process.stderr.write(`ERROR [${md.slug}] colorMode: JSON='${json.colorMode}', MD='${md.colorMode}'\n`);
    errors++;
  }

  // density
  if (md.density && json.density !== md.density) {
    process.stderr.write(`ERROR [${md.slug}] density: JSON='${json.density}', MD='${md.density}'\n`);
    errors++;
  }

  // trending — only flag when MD explicitly marks trending:yes but JSON disagrees
  if (md.trending === true && json.trending !== true) {
    process.stderr.write(`ERROR [${md.slug}] trending: JSON='${json.trending}', MD='true'\n`);
    errors++;
  }

  // antiPatterns — sorted lowercase comparison; mismatch is an ERROR (concept drift fails CI)
  if (md.antiPatterns.length > 0) {
    const normalize = (arr) => [...arr].map((s) => s.toLowerCase().trim()).sort();
    const mdNorm = normalize(md.antiPatterns);
    const jsonNorm = normalize(json.antiPatterns ?? []);
    const mdStr = mdNorm.join("|");
    const jsonStr = jsonNorm.join("|");
    if (mdStr !== jsonStr) {
      process.stderr.write(
        `ERROR [${md.slug}] antiPatterns mismatch:\n` +
        `  MD:   ${JSON.stringify(md.antiPatterns)}\n` +
        `  JSON: ${JSON.stringify(json.antiPatterns ?? [])}\n`,
      );
      errors++;
      if (FIX_MODE) {
        fixes.push({ slug: md.slug, antiPatterns: md.antiPatterns });
      }
    }
  }
}

// Check every JSON persona appears in MD (warn only — JSON may have extras if MD is ahead)
for (const json of jsonPersonas) {
  if (!mdBySlug.has(json.slug)) {
    process.stderr.write(`WARN: persona '${json.slug}' in personas.json has no matching Markdown block\n`);
  }
}

// ─── Apply fixes ──────────────────────────────────────────────────────────────

if (FIX_MODE && fixes.length > 0) {
  const updated = jsonPersonas.map((p) => {
    const fix = fixes.find((f) => f.slug === p.slug);
    return fix ? { ...p, antiPatterns: fix.antiPatterns } : p;
  });
  writeFileSync(PERSONAS_JSON, JSON.stringify(updated, null, 2) + "\n", "utf8");
  process.stdout.write(`Fixed antiPatterns for: ${fixes.map((f) => f.slug).join(", ")}\n`);
}

// ─── Result ───────────────────────────────────────────────────────────────────

if (errors > 0) {
  process.stderr.write(`\n${errors} error(s) found — personas.json is out of sync with Markdown.\n`);
  process.exit(1);
}
process.stdout.write(`OK: ${mdPersonas.length} personas verified against Markdown family files.\n`);
