/**
 * Specimen-grid completeness — the registry's state/variant matrix as a machine-checkable contract
 * (learn-from-shadcn Phase 3). A shadcn component page lays out every variant × size × state as a
 * grid; `ui ingest-figma-ds` captures that as `variants: ["Dim=Value", …]`. This reads it back and
 * asks the `component-design.md` question — "are the *applicable* states present?" — WITHOUT the
 * over-fire trap: it only flags gaps that are reliably modelled as Figma variants (`disabled` on an
 * interactive control; `empty` on a data component). Focus is deliberately NOT required — it is
 * usually a runtime `:focus-visible`, not a Figma variant, so demanding it would over-fire. Pure.
 */

export interface SpecimenComponent {
  name: string;
  category?: string;
  variants?: string[];
  states?: string[];
}
export type SpecimenSeverity = "warning";
export interface SpecimenFinding {
  component: string;
  checkId: string;
  severity: SpecimenSeverity;
  message: string;
}
export interface SpecimenComponentReport {
  name: string;
  /** Parsed variant dimensions: dim → sorted distinct values. */
  dimensions: Record<string, string[]>;
  /** Normalised state tokens the component declares. */
  states: string[];
  findings: SpecimenFinding[];
}
export interface SpecimenResult {
  components: SpecimenComponentReport[];
  /** Components that declare any interaction/data state (i.e. participate in the contract). */
  stateful: number;
  findings: SpecimenFinding[];
  warningCount: number;
}

const INTERACTION_STATES = ["hover", "pressed", "active", "loading"] as const;
/** Data CONTAINERS that need an empty state — matched on the LEAF role, not a parent prefix. */
const DATA_FAMILY_RE = /^(table|list|listbox|select|combobox|grid|datagrid|menu|dropdown|tree|autocomplete|results?|feed|inbox|board)$/i;
/** Real form CONTROLS where a missing `disabled` variant is a reliable gap (not icons/close buttons). */
const CONTROL_FAMILY_RE = /^(button|btn|input|textarea|select|combobox|toggle|switch|checkbox|radio|menuitem|menu ?item|tab|chip|slider|stepper|field|option|link)$/i;

/** Last `/`-separated segment, lowercased — the component's own role, ignoring parent-page prefixes. */
function leafRole(name: string): string {
  const parts = name.split("/").map((s) => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

/** Split `["Size=lg","State=Hover"]` into `{ size:["lg"], state:["Hover"] }` (values de-duped, sorted). */
export function parseDimensions(variants: readonly string[]): Record<string, string[]> {
  const dims = new Map<string, Set<string>>();
  for (const v of variants) {
    const eq = v.indexOf("=");
    if (eq <= 0) continue;
    const dim = v.slice(0, eq).trim().toLowerCase();
    const val = v.slice(eq + 1).trim();
    if (dim === "" || val === "") continue;
    (dims.get(dim) ?? dims.set(dim, new Set()).get(dim) as Set<string>).add(val);
  }
  const out: Record<string, string[]> = {};
  for (const [dim, vals] of [...dims.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[dim] = [...vals].sort();
  }
  return out;
}

/** Map a raw variant/state value to a canonical state token, or null if it isn't a state word. */
export function normalizeState(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/\b(default|rest|normal|enabled)\b/.test(s)) return "default";
  if (/\bhover(ed)?\b/.test(s)) return "hover";
  if (/\b(pressed|press|down|clicked)\b/.test(s)) return "pressed";
  if (/\bactive\b/.test(s)) return "active";
  if (/\bfocus(ed|-visible)?\b/.test(s)) return "focus";
  if (/\bdisabled?\b/.test(s)) return "disabled";
  if (/\bloading\b/.test(s)) return "loading";
  if (/\b(selected|checked|on)\b/.test(s)) return "selected";
  if (/\bempty\b/.test(s)) return "empty";
  if (/\bskeleton\b/.test(s)) return "skeleton";
  if (/\berror\b/.test(s)) return "error";
  return null;
}

/** Collect the normalised state tokens a component declares, from its state dimension + states[]. */
function statesOf(dims: Record<string, string[]>, states?: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const dimName of ["state", "status", "interaction"]) {
    for (const v of dims[dimName] ?? []) { const n = normalizeState(v); if (n !== null) out.add(n); }
  }
  for (const s of states ?? []) { const n = normalizeState(s); if (n !== null) out.add(n); }
  return out;
}

const isInteractive = (present: Set<string>): boolean => INTERACTION_STATES.some((s) => present.has(s));

export function checkSpecimen(components: readonly SpecimenComponent[]): SpecimenResult {
  const reports: SpecimenComponentReport[] = [];
  const all: SpecimenFinding[] = [];
  let stateful = 0;

  for (const c of components) {
    const dims = parseDimensions(c.variants ?? []);
    const present = statesOf(dims, c.states);
    if (present.size === 0) { // no declared state → not part of the contract
      reports.push({ name: c.name, dimensions: dims, states: [], findings: [] });
      continue;
    }
    stateful++;
    const findings: SpecimenFinding[] = [];
    const leaf = leafRole(c.name);
    // A real form CONTROL that models interaction states but no `disabled` (disabled IS a Figma
    // variant convention → a reliable gap). Gated to the control family so icons/close buttons
    // (which legitimately omit disabled) don't over-fire.
    if (CONTROL_FAMILY_RE.test(leaf) && isInteractive(present) && !present.has("disabled")) {
      findings.push({ component: c.name, checkId: "missing-disabled", severity: "warning",
        message: `${leaf} declares ${[...present].filter((s) => (INTERACTION_STATES as readonly string[]).includes(s)).join("/")} but no 'disabled' state` });
    }
    // A data CONTAINER (matched on leaf role, not a parent prefix) with states but no `empty`.
    if (DATA_FAMILY_RE.test(leaf) && !present.has("empty")) {
      findings.push({ component: c.name, checkId: "missing-empty", severity: "warning",
        message: `${leaf} is a data container but declares no 'empty' state (data-bearing UIs need one)` });
    }
    all.push(...findings);
    reports.push({ name: c.name, dimensions: dims, states: [...present].sort(), findings });
  }

  all.sort((a, b) => a.component.localeCompare(b.component) || a.checkId.localeCompare(b.checkId));
  return { components: reports, stateful, findings: all, warningCount: all.length };
}
