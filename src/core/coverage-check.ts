/**
 * Deterministic acceptance-criteria coverage check (the curator's goal-axis
 * accounting). Given a brief spec (acceptance criteria) and a produced design
 * manifest (screens + which criteria each covers), report which criteria are
 * uncovered and the coverage %. Pure, zero-network, zero-LLM.
 */

export interface AcceptanceCriterion {
  id: string;
  text?: string;
}
export interface CoverageSpec {
  acceptanceCriteria: AcceptanceCriterion[];
  successMetrics?: string[];
}
export interface DesignScreen {
  name: string;
  coversCriteria?: string[];
  states?: string[];
}
export interface DesignManifest {
  screens: DesignScreen[];
}
export interface CoverageResult {
  coveragePct: number;
  criterionCount: number;
  screenCount: number;
  covered: string[];
  uncovered: string[];
  perCriterion: { id: string; text?: string; coveredBy: string[] }[];
  unknownRefs: string[]; // criteria ids referenced by a screen but absent from the spec
}

/** Thrown on a malformed spec/manifest — the command maps it to BAD_JSON. */
export class CoverageError extends Error {
  constructor(readonly code: "BAD_JSON", message: string) {
    super(message);
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseSpec(json: unknown, path: string): CoverageSpec {
  if (!isObj(json) || !Array.isArray(json["acceptanceCriteria"])) {
    throw new CoverageError("BAD_JSON", `spec '${path}' must be { acceptanceCriteria: [{ id, text? }], successMetrics?: [...] }`);
  }
  const criteria: AcceptanceCriterion[] = [];
  for (const c of json["acceptanceCriteria"] as unknown[]) {
    if (!isObj(c) || typeof c["id"] !== "string" || c["id"] === "") {
      throw new CoverageError("BAD_JSON", `each acceptanceCriteria entry in '${path}' needs a non-empty string id`);
    }
    criteria.push({ id: c["id"], text: typeof c["text"] === "string" ? c["text"] : undefined });
  }
  const metrics = Array.isArray(json["successMetrics"]) ? (json["successMetrics"] as unknown[]).filter((m): m is string => typeof m === "string") : undefined;
  return { acceptanceCriteria: criteria, successMetrics: metrics };
}

export function parseManifest(json: unknown, path: string): DesignManifest {
  if (!isObj(json) || !Array.isArray(json["screens"])) {
    throw new CoverageError("BAD_JSON", `manifest '${path}' must be { screens: [{ name, coversCriteria?: [...], states?: [...] }] }`);
  }
  const screens: DesignScreen[] = [];
  for (const s of json["screens"] as unknown[]) {
    if (!isObj(s) || typeof s["name"] !== "string") {
      throw new CoverageError("BAD_JSON", `each screen in '${path}' needs a string name`);
    }
    const covers = Array.isArray(s["coversCriteria"]) ? (s["coversCriteria"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const states = Array.isArray(s["states"]) ? (s["states"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    screens.push({ name: s["name"], coversCriteria: covers, states });
  }
  return { screens };
}

export function checkCoverage(spec: CoverageSpec, manifest: DesignManifest): CoverageResult {
  const criteria = spec.acceptanceCriteria;
  const screens = manifest.screens;
  const validIds = new Set(criteria.map((c) => c.id));

  const perCriterion = criteria.map((c) => ({
    id: c.id,
    text: c.text,
    coveredBy: screens.filter((s) => (s.coversCriteria ?? []).includes(c.id)).map((s) => s.name),
  }));
  const covered = perCriterion.filter((p) => p.coveredBy.length > 0).map((p) => p.id);
  const uncovered = perCriterion.filter((p) => p.coveredBy.length === 0).map((p) => p.id);

  // Referenced-but-undefined ids (a screen claims to cover a criterion the spec doesn't list) — a real drift signal.
  const unknownRefs = [
    ...new Set(screens.flatMap((s) => (s.coversCriteria ?? []).filter((id) => !validIds.has(id)))),
  ].sort();

  const coveragePct = criteria.length === 0 ? 100 : Math.round((100 * covered.length) / criteria.length);
  return { coveragePct, criterionCount: criteria.length, screenCount: screens.length, covered, uncovered, perCriterion, unknownRefs };
}
