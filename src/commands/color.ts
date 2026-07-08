/**
 * `ui color` command — OKLCH color math exposed as a CLI.
 *
 * Subcommands: convert | scale | contrast | semantic
 * All subcommands support --json (JsonEnvelope) and plain text output.
 * No math here — pure argument validation + core function calls + output shaping.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errText, errJson, ok, okJson } from "../core/output.js";
import { hexToOKLCH, oklchToHex, ColorError } from "../core/color-convert.js";
import {
  generatePalette,
  contrastRatio,
  classifyContrast,
  STOPS,
} from "../core/color-scale.js";
import { generateSemanticPalette } from "../core/color-roles.js";
import {
  formatConvert,
  formatScale,
  formatContrast,
  formatSemantic,
} from "./color-format.js";

const CMD = "color";

export const COLOR_HELP = `ui color — OKLCH color math

Usage:
  ui color convert <hex> [--oklch "<L> <C> <H>" --to hex]
  ui color scale <hex>
  ui color contrast <hex1> <hex2>
  ui color semantic <name:hex> [<name:hex>...]

Subcommands:
  convert   Convert hex → OKLCH triple (or OKLCH → hex with --oklch / --to hex)
  scale     Generate an 11-stop perceptual color scale
  contrast  Compute WCAG 2.2 contrast ratio between two colors
  semantic  Generate a semantic palette from named hex colors

Options:
  --json    Emit a JSON envelope instead of human-readable text
  -h, --help  Show this help

Error codes:
  BAD_ARG   Missing/invalid argument (e.g. malformed --oklch triple)
  BAD_HEX   A color value is not a valid 3- or 6-digit hex color
`;

// ─── Hex normalisation ────────────────────────────────────────────────────────

/** Normalise a hex string: add # if missing, uppercase. */
function normaliseHex(raw: string): string {
  const s = raw.startsWith("#") ? raw : `#${raw}`;
  return s.toUpperCase();
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

function runConvert(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const cmd = `${CMD} convert`;

  // Reverse mode: --oklch "L C H" --to hex
  const oklchStr = parsed.flags["oklch"];
  if (oklchStr !== undefined && oklchStr !== true) {
    const parts = String(oklchStr).trim().split(/\s+/);
    if (parts.length !== 3) {
      const msg = `--oklch requires three space-separated numbers: L C H`;
      return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const [ls, cs, hs] = parts;
    const l = parseFloat(ls ?? "");
    const c = parseFloat(cs ?? "");
    const h = parseFloat(hs ?? "");
    if (isNaN(l) || isNaN(c) || isNaN(h)) {
      const msg = `--oklch values must be numbers`;
      return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const hex = oklchToHex(l, c, h);
    if (useJson) return okJson(cmd, { oklch: { l, c, h }, hex });
    return ok(`oklch(${l} ${c} ${h})  →  ${hex}\n`);
  }

  const rawHex = parsed.positionals[0];
  if (rawHex === undefined) {
    const msg = `ui color convert requires a <hex> argument`;
    return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const hex = normaliseHex(rawHex);
  try {
    const oklch = hexToOKLCH(hex);
    const rounded = {
      l: Math.round(oklch.l * 100) / 100,
      c: Math.round(oklch.c * 100) / 100,
      h: Math.round(oklch.h * 10) / 10,
    };
    if (useJson) return okJson(cmd, { hex, oklch: rounded });
    return ok(formatConvert(hex, rounded));
  } catch (e) {
    if (e instanceof ColorError) {
      return useJson
        ? errJson(cmd, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
}

function runScale(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const cmd = `${CMD} scale`;

  const rawHex = parsed.positionals[0];
  if (rawHex === undefined) {
    const msg = `ui color scale requires a <hex> argument`;
    return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const hex = normaliseHex(rawHex);
  try {
    const scale = generatePalette(hex);
    if (useJson) {
      const stops = STOPS.map((stop) => ({
        stop,
        hex: scale.shades[String(stop)] ?? "",
        contrastWhite: scale.contrast[String(stop)] ?? 0,
        wcag: classifyContrast(scale.contrast[String(stop)] ?? 0),
      }));
      return okJson(cmd, {
        baseHex: scale.baseHex,
        anchorStop: scale.anchorStop,
        stops,
      });
    }
    return ok(formatScale(scale));
  } catch (e) {
    if (e instanceof ColorError) {
      return useJson
        ? errJson(cmd, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
}

function runContrast(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const cmd = `${CMD} contrast`;

  const raw1 = parsed.positionals[0];
  const raw2 = parsed.positionals[1];
  if (raw1 === undefined || raw2 === undefined) {
    const msg = `ui color contrast requires two <hex> arguments`;
    return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const hex1 = normaliseHex(raw1);
  const hex2 = normaliseHex(raw2);
  try {
    // Validate both colors exist before computing
    hexToOKLCH(hex1);
    hexToOKLCH(hex2);
    const ratio = Math.round(contrastRatio(hex1, hex2) * 100) / 100;
    const level = classifyContrast(ratio);
    if (useJson) {
      return okJson(cmd, { fg: hex1, bg: hex2, ratio, wcag: level });
    }
    return ok(formatContrast(hex1, hex2, ratio, level));
  } catch (e) {
    if (e instanceof ColorError) {
      return useJson
        ? errJson(cmd, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
}

function runSemantic(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const cmd = `${CMD} semantic`;

  // positionals are the subcommand slot + any extras; after the parser carves
  // out command="color" and subcommand="semantic", the rest are in positionals.
  const pairs = parsed.positionals;
  if (pairs.length === 0) {
    const msg = `ui color semantic requires at least one <name:hex> argument`;
    return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const colors: { name: string; value: string }[] = [];
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) {
      const msg = `invalid argument '${pair}' — expected name:hex format`;
      return useJson ? errJson(cmd, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const name = pair.slice(0, colonIdx);
    const value = normaliseHex(pair.slice(colonIdx + 1));
    colors.push({ name, value });
  }

  try {
    const palette = generateSemanticPalette(colors);
    if (useJson) {
      const entries = palette.entries.map((entry) => ({
        role: entry.role,
        baseName: entry.baseName,
        baseHex: entry.baseHex,
        stops: STOPS.map((stop) => ({
          stop,
          hex: entry.scale.shades[String(stop)] ?? "",
          contrastWhite: entry.scale.contrast[String(stop)] ?? 0,
          wcag: classifyContrast(entry.scale.contrast[String(stop)] ?? 0),
        })),
      }));
      return okJson(cmd, { entries });
    }
    return ok(formatSemantic(palette));
  } catch (e) {
    if (e instanceof ColorError) {
      return useJson
        ? errJson(cmd, e.code, e.message)
        : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
}

// ─── Command registration object ──────────────────────────────────────────────

export const colorCommand = {
  name: CMD,
  summary: "OKLCH color math: convert, scale, contrast, semantic palette",
  hasSubcommands: true,
  help: COLOR_HELP,
  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "convert":  return runConvert(parsed);
      case "scale":    return runScale(parsed);
      case "contrast": return runContrast(parsed);
      case "semantic": return runSemantic(parsed);
      case undefined: {
        const msg = `ui color requires a subcommand. Run 'ui color --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui color --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
