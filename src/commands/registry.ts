/**
 * `ui registry` command — JSON-backed component registry store.
 *
 * Subcommands: register | lookup | list
 * Default registry file: ./design/component-registry.json (cwd-relative).
 * --file <path> always overrides.
 *
 * register: auto-creates file if absent; requires --force to overwrite.
 * lookup / list: error if file absent (REGISTRY_NOT_FOUND).
 */
import { resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { readMarkup } from "../core/registry-markup-reader.js";
import {
  RegistryError,
  validateComponentRecord,
  createEmptyRegistry,
  loadRegistry,
  saveRegistry,
  registerComponent,
  lookupComponent,
  listComponents,
} from "../core/registry-store.js";

const CMD = "registry";
const DEFAULT_REGISTRY_PATH = "./design/component-registry.json";

export const REGISTRY_HELP = `ui registry — component registry store

Usage:
  ui registry register <Category/Variant> --category <c> --markup <file|->
                        [--tokens a,b,c] [--variants x,y] [--states s1,s2]
                        [--description "..."] [--force] [--file <path>] [--json]
  ui registry lookup <Category/Variant> [--file <path>] [--json]
  ui registry list [--category <c>] [--file <path>] [--json]

Subcommands:
  register  Add (or replace with --force) a component in the registry
  lookup    Find a component by canonical name
  list      List all components, optionally filtered by category

Options:
  --file <path>    Registry file path (default: ./design/component-registry.json)
  --force          Overwrite an existing component (register only)
  --json           Emit a JSON envelope instead of human-readable output
  -h, --help       Show this help

Name format:
  Category/Variant — both segments PascalCase, letters only (e.g. Button/Primary)

Token paths:
  Comma-separated, each matching ^[a-z][a-z0-9.-]*$ (e.g. color.primary,space.4)

States enum:
  default, hover, active, focus, disabled

Error codes:
  BAD_ARG            Missing subcommand, positional, or required flag
  BAD_NAME           Name does not match Category/Variant pattern
  BAD_STATE          A --states value not in the enum
  BAD_TOKEN          A --tokens value fails the token-path pattern
  NAME_EXISTS        register of existing name without --force
  NOT_FOUND          lookup of absent name
  FILE_NOT_FOUND     --markup file does not exist
  REGISTRY_NOT_FOUND Registry file absent on lookup/list
  BAD_REGISTRY       Registry file is invalid JSON or wrong shape
  READ_ERROR / WRITE_ERROR  Non-ENOENT I/O failure

Notes:
  - register auto-creates the registry file if it does not exist.
  - Components are sorted by name on every write (deterministic output).
  - Concurrent invocations are not protected against races (single-shot CLI).
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveRegistryPath(parsed: ParsedArgs): string {
  const f = parsed.flags["file"];
  const raw = typeof f === "string" ? f : DEFAULT_REGISTRY_PATH;
  return resolve(raw);
}

function flagString(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

function splitComma(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// ─── Subcommand: register ─────────────────────────────────────────────────────

function runRegister(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const sub = "registry register";

  // Positional: canonical name (subcommand slot was consumed by parser as subcommand="register",
  // so the name is in positionals[0])
  const name = parsed.positionals[0];
  if (name === undefined) {
    const msg = "ui registry register requires a <Category/Variant> name";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const category = flagString(parsed, "category");
  if (category === undefined) {
    const msg = "ui registry register requires --category <value>";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const markupArg = flagString(parsed, "markup");
  if (markupArg === undefined) {
    const msg = "ui registry register requires --markup <file|-> ";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const force = parsed.flags["force"] === true;
  const registryPath = resolveRegistryPath(parsed);

  // Read markup
  let markup: string;
  try {
    markup = readMarkup(markupArg);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Build + validate record
  const rawRecord = {
    name,
    category,
    markup,
    tokensUsed: splitComma(flagString(parsed, "tokens")),
    ...(flagString(parsed, "variants") !== undefined && {
      variants: splitComma(flagString(parsed, "variants")),
    }),
    ...(flagString(parsed, "states") !== undefined && {
      states: splitComma(flagString(parsed, "states")),
    }),
    ...(flagString(parsed, "description") !== undefined && {
      description: flagString(parsed, "description"),
    }),
  };

  let record;
  try {
    record = validateComponentRecord(rawRecord);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Load or create registry
  let reg;
  try {
    reg = loadRegistry(registryPath);
  } catch (e) {
    if (e instanceof RegistryError && e.code === "REGISTRY_NOT_FOUND") {
      reg = createEmptyRegistry();
    } else if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    } else {
      throw e;
    }
  }

  // Register (may throw NAME_EXISTS)
  let result;
  try {
    result = registerComponent(reg, record, force);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Save
  try {
    saveRegistry(registryPath, result.registry);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  if (useJson) {
    return okJson(sub, {
      file: registryPath,
      component: record,
      replaced: result.replaced,
    });
  }

  const verb = result.replaced ? "replaced" : "registered";
  return {
    exitCode: 0,
    stdout: `${verb}: ${record.name} (${record.category}) → ${registryPath}\n`,
  };
}

// ─── Subcommand: lookup ───────────────────────────────────────────────────────

function runLookup(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const sub = "registry lookup";

  const name = parsed.positionals[0];
  if (name === undefined) {
    const msg = "ui registry lookup requires a <Category/Variant> name";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const registryPath = resolveRegistryPath(parsed);

  let reg;
  try {
    reg = loadRegistry(registryPath);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  const component = lookupComponent(reg, name);
  if (component === undefined) {
    const msg = `no component named '${name}'`;
    return useJson ? errJson(sub, "NOT_FOUND", msg) : errText(`ui: ${msg}\n`);
  }

  if (useJson) {
    return okJson(sub, { component });
  }

  return {
    exitCode: 0,
    stdout: JSON.stringify(component, null, 2) + "\n",
  };
}

// ─── Subcommand: list ─────────────────────────────────────────────────────────

function runList(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const sub = "registry list";

  const categoryFilter = flagString(parsed, "category");
  const registryPath = resolveRegistryPath(parsed);

  let reg;
  try {
    reg = loadRegistry(registryPath);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  const components = listComponents(reg, categoryFilter);
  const summaries = components.map((c) => ({ name: c.name, category: c.category }));

  if (useJson) {
    return okJson(sub, {
      file: registryPath,
      count: summaries.length,
      components: summaries,
    });
  }

  if (summaries.length === 0) {
    const filterNote = categoryFilter ? ` in category '${categoryFilter}'` : "";
    return { exitCode: 0, stdout: `No components found${filterNote}.\n` };
  }

  const lines = summaries.map((s) => `${s.name.padEnd(32)} ${s.category}`);
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

// ─── Command registration object ──────────────────────────────────────────────

export const registryCommand = {
  name: CMD,
  summary: "Component registry store: register, lookup, list",
  hasSubcommands: true,
  help: REGISTRY_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "register": return runRegister(parsed);
      case "lookup":   return runLookup(parsed);
      case "list":     return runList(parsed);
      case undefined: {
        const msg = "ui registry requires a subcommand. Run 'ui registry --help'.";
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui registry --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
