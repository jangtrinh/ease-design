/**
 * Audit family: source-fidelity
 *
 * Compares emitted DESIGN.md token values against the source-of-truth
 * `tokens.json` produced by `ui designmd extract-tokens`. This is the
 * family that catches the v1.x failure mode: shipping an invented hex
 * (e.g. `#d97706`) when the source CSS clearly used a different one
 * (e.g. `#f97316`).
 *
 * Rules:
 *   - FAIL: every emitted hex must appear in tokens.json with count ≥ 1.
 *   - WARN: top-N source hex (N=5) by frequency that don't appear in
 *           the emitted YAML (likely missed-dominant).
 *   - FAIL: every emitted typography.<group>.<name>.fontFamily first
 *           name must appear in tokens.json's fonts[].family list (case
 *           insensitive after quote-strip).
 *
 * Source CSS unavailable (empty tokens.json) downgrades all FAILs in
 * this family to WARNs with the rationale "summary-grade only".
 */
import { walkYamlLeaves } from "./designmd-parser.js";
import type { DesignMdDocument, YamlNode } from "./designmd-parser.js";
import type { AuditRow } from "./designmd-audit-types.js";

export interface TokensJson {
  colors?: { hex: string; count: number; sources?: string[] }[];
  fonts?: { family: string }[];
  customProperties?: { name: string; hex?: string }[];
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TOP_SOURCE_HEX_THRESHOLD = 5;
/** Source hex with fewer occurrences than this aren't flagged as missed-dominant. */
const SOURCE_HEX_MIN_COUNT = 4;

export function auditSourceFidelity(
  doc: DesignMdDocument,
  tokens: TokensJson,
): AuditRow[] {
  const rows: AuditRow[] = [];

  const colors = tokens.colors ?? [];
  const fonts = tokens.fonts ?? [];
  const noSource = colors.length === 0 && fonts.length === 0;

  if (noSource) {
    rows.push({
      family: "source-fidelity",
      rule: "source-tokens-available",
      status: "WARN",
      detail: "tokens.json is empty — source CSS unavailable; token confidence is summary-grade only",
      suggestedFix: "ensure the workflow fetched at least one linked stylesheet, or accept the summary-grade run",
    });
    return rows;
  }

  // Index for fast lookup
  const sourceHexSet = new Set(colors.map(c => c.hex.toLowerCase()));
  // Custom-property-resolved hex values also count as "in source"
  for (const cp of tokens.customProperties ?? []) {
    if (cp.hex) sourceHexSet.add(cp.hex.toLowerCase());
  }

  // 1. Every emitted hex appears in source
  const colorsNode = doc.yamlTree["colors"];
  const emittedHex: { path: string; hex: string }[] = [];
  if (colorsNode && typeof colorsNode !== "string") {
    for (const [path, value] of walkYamlLeaves(colorsNode, "colors")) {
      if (HEX_RE.test(value)) emittedHex.push({ path, hex: value.toLowerCase() });
    }
  }

  const invented = emittedHex.filter(e => !sourceHexSet.has(e.hex));
  if (invented.length === 0) {
    rows.push({
      family: "source-fidelity",
      rule: "no-invented-hex",
      status: "PASS",
      detail: `all ${emittedHex.length} emitted hex value(s) appear in source CSS`,
    });
  } else {
    rows.push({
      family: "source-fidelity",
      rule: "no-invented-hex",
      status: "FAIL",
      detail: `${invented.length} emitted hex not in source: ${invented.slice(0, 3).map(i => `${i.path} = ${i.hex}`).join("; ")}`,
      suggestedFix: `replace each invented hex with a value from tokens.json (sample candidates: ${colors.slice(0, 3).map(c => c.hex).join(", ")})`,
    });
  }

  // 2. Top-N source hex frequency-ranked must be represented in some emitted value
  const emittedHexSet = new Set(emittedHex.map(e => e.hex));
  // Drop very-common neutral chrome values (#000000, #ffffff) — most DESIGN.md
  // pages don't enumerate every neutral. Surface remaining top-N.
  const skipNeutrals = new Set(["#000000", "#ffffff", "#fff"]);
  const dominant = colors
    .filter(c => c.count >= SOURCE_HEX_MIN_COUNT && !skipNeutrals.has(c.hex.toLowerCase()))
    .slice(0, TOP_SOURCE_HEX_THRESHOLD);
  const missed = dominant.filter(d => !emittedHexSet.has(d.hex.toLowerCase()));
  if (missed.length === 0) {
    rows.push({
      family: "source-fidelity",
      rule: "top-source-hex-emitted",
      status: "PASS",
      detail: `top ${TOP_SOURCE_HEX_THRESHOLD} source hex values are all represented`,
    });
  } else {
    rows.push({
      family: "source-fidelity",
      rule: "top-source-hex-emitted",
      status: "WARN",
      detail: `${missed.length} dominant source hex missing from emitted YAML: ${missed.map(m => `${m.hex} (×${m.count})`).join(", ")}`,
      suggestedFix: "consider adding these as semantic roles in colors:, or add an inline YAML comment `# excluded: <reason>` to acknowledge intent",
    });
  }

  // 3. Every emitted fontFamily first-name appears in source
  const typographyNode = doc.yamlTree["typography"];
  const emittedFamilies = new Set<string>();
  if (typographyNode && typeof typographyNode !== "string") {
    walkTypographyFamilies(typographyNode, "typography", emittedFamilies);
  }
  const sourceFamilyLower = new Set(fonts.map(f => f.family.toLowerCase()));
  const missingFonts: string[] = [];
  for (const f of emittedFamilies) {
    if (!sourceFamilyLower.has(f.toLowerCase())) {
      missingFonts.push(f);
    }
  }
  if (missingFonts.length === 0) {
    rows.push({
      family: "source-fidelity",
      rule: "fonts-present-in-source",
      status: "PASS",
      detail: `all ${emittedFamilies.size} emitted font family name(s) appear in source`,
    });
  } else {
    rows.push({
      family: "source-fidelity",
      rule: "fonts-present-in-source",
      status: "FAIL",
      detail: `${missingFonts.length} emitted font family not in source: ${missingFonts.join(", ")}`,
      suggestedFix: `replace with families from tokens.json (sample candidates: ${fonts.slice(0, 3).map(f => f.family).join(", ")})`,
    });
  }

  return rows;
}

/** Find every typography.*.fontFamily leaf, parse the first family name, accumulate. */
function walkTypographyFamilies(node: YamlNode, prefix: string, out: Set<string>): void {
  for (const key of Object.keys(node)) {
    const v = node[key]!;
    const path = `${prefix}.${key}`;
    if (typeof v === "string") {
      if (path.endsWith(".fontFamily")) {
        const first = parseFirstFontName(v);
        if (first) out.add(first);
      }
    } else {
      walkTypographyFamilies(v, path, out);
    }
  }
}

function parseFirstFontName(stack: string): string | undefined {
  const firstRaw = stack.split(",")[0]?.trim();
  if (!firstRaw) return undefined;
  const cleaned = firstRaw.replace(/^["']|["']$/g, "").trim();
  if (cleaned.length === 0) return undefined;
  // Skip generic fallbacks
  if (/^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|inherit|initial)$/i.test(cleaned)) return undefined;
  return cleaned;
}
