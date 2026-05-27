/**
 * Lightweight DESIGN.md parser used by every audit family.
 *
 * Splits a DESIGN.md file into:
 *   - frontMatter      raw YAML text between the first two `---` lines
 *   - bodyMarkdown     everything after the front-matter
 *   - sectionHeadings  ordered list of `## ` headings (text only)
 *   - yamlTree         a shallow nested object parsed from the front-matter
 *
 * We do NOT use a full YAML parser — the front-matter shape is constrained
 * (groups → names → either string values or object-of-strings). A
 * hand-rolled scanner avoids the dependency and matches the audit's needs.
 *
 * The parser is permissive: malformed front-matter yields a partial tree
 * with `parseErrors` populated. Audit families check `parseErrors` length
 * before walking the tree.
 */

export interface DesignMdDocument {
  raw: string;
  frontMatterRaw: string;
  bodyMarkdown: string;
  sectionHeadings: string[];
  yamlTree: YamlNode;
  parseErrors: string[];
}

export type YamlNode = { [key: string]: YamlNode | string };

/**
 * Parse a DESIGN.md file.
 *
 * @throws never — errors land in `parseErrors`.
 */
export function parseDesignMd(raw: string): DesignMdDocument {
  const errors: string[] = [];

  // 1. Extract front-matter (between first two --- lines)
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let frontMatterRaw = "";
  let bodyMarkdown = raw;
  if (fmMatch) {
    frontMatterRaw = fmMatch[1]!;
    bodyMarkdown = raw.slice(fmMatch[0].length);
  } else {
    errors.push("missing front-matter (expected --- delimited YAML block at top of file)");
  }

  // 2. Walk the YAML body line-by-line into a nested tree.
  const yamlTree: YamlNode = {};
  const stack: { node: YamlNode; depth: number }[] = [{ node: yamlTree, depth: -1 }];

  const lines = frontMatterRaw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip blank lines, full-line comments, and YAML document markers.
    if (/^\s*(#|$)/.test(line)) continue;
    if (line.trim() === "---") continue;

    // Drop inline trailing comments (e.g. "value  # comment")
    const noComment = stripInlineYamlComment(line);

    const m = noComment.match(/^(\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[\w.-]+)\s*:\s*(.*)$/);
    if (!m) {
      // Could be a continuation; ignore for our use.
      continue;
    }
    const indent = m[1]!;
    const keyRaw = m[2]!;
    const valueRaw = m[3]!.trim();
    const depth = Math.floor(indent.length / 2);
    const key = stripQuotes(keyRaw);

    // Pop stack to parent depth
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) {
      errors.push(`line ${i + 1}: indent jump with no parent`);
      continue;
    }
    if (valueRaw === "" || valueRaw === "{}") {
      // Open a new object node
      const node: YamlNode = {};
      parent.node[key] = node;
      stack.push({ node, depth });
    } else {
      // Scalar value — strip surrounding quotes when present
      parent.node[key] = stripQuotes(valueRaw);
    }
  }

  // 3. Section headings — only the immediate `## ` level (not deeper).
  const sectionHeadings: string[] = [];
  const headingRe = /^##\s+(.+?)\s*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(bodyMarkdown)) !== null) {
    sectionHeadings.push(hm[1]!.trim());
  }

  return {
    raw,
    frontMatterRaw,
    bodyMarkdown,
    sectionHeadings,
    yamlTree,
    parseErrors: errors,
  };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Strip an inline trailing comment from a YAML scalar line, respecting
 * quoted strings. We deliberately keep this simple — front-matter rarely
 * mixes `#` inside values that the audit cares about.
 */
function stripInlineYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      // Only treat as comment if preceded by whitespace (avoid `#fff`)
      if (i === 0 || /\s/.test(line[i - 1]!)) {
        return line.slice(0, i).trimEnd();
      }
    }
  }
  return line;
}

/**
 * Walk every leaf (string-valued) node in the YAML tree, yielding
 * dot-path + value tuples. Used by ref-integrity (to know what paths
 * are defined) and source-fidelity (to find every hex/font value).
 */
export function* walkYamlLeaves(node: YamlNode, prefix = ""): Generator<[string, string]> {
  for (const key of Object.keys(node)) {
    const v = node[key]!;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof v === "string") {
      yield [path, v];
    } else {
      yield* walkYamlLeaves(v, path);
    }
  }
}

/**
 * Walk every node (string OR object) yielding dot-paths. Used by
 * ref-integrity to know which group paths can be referenced.
 */
export function* walkYamlPaths(node: YamlNode, prefix = ""): Generator<string> {
  for (const key of Object.keys(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    yield path;
    const v = node[key];
    if (v !== undefined && typeof v !== "string") {
      yield* walkYamlPaths(v, path);
    }
  }
}
