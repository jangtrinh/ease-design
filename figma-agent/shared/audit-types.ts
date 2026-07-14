// Raw-facts contract for the AUDIT_DS command — the ONE shape the plugin emits and
// the CLI detect core consumes. Lives in shared/ because both bundles import it
// (plugin: executor-audit.ts; CLI: audit-ds-detect.ts) and neither may reach into
// the other's tree. The plugin gathers these facts WITHOUT judgment; every flag,
// cluster and summary is computed later in the pure CLI detector.

/** One inventoried COMPONENT or COMPONENT_SET — plain data, no verdicts. */
export interface AuditComponentFact {
  id: string;
  key: string | null;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  /** SET: number of variant children; a lone COMPONENT: 0. */
  variantCount: number;
  /** SET: the VARIANT axes from componentPropertyDefinitions (axisName → options). */
  variantAxes: Record<string, string[]>;
  pageName: string;
  /** Name of the nearest ancestor SECTION, or null when outside every section. */
  section: string | null;
  /** getSharedPluginData('idp','status') === 'deprecated'. */
  deprecatedData: boolean;
  /** Types of the representative node's direct children (SET: first variant; COMPONENT: itself). */
  childTypeSignature: string[];
  /** SOLID paints on the representative + its direct children NOT bound to a color variable. */
  unboundFills: number;
  unboundStrokes: number;
}

/** Instance-usage tally, resolved to the SET (or lone component) id. */
export interface AuditUsageFacts {
  /** set-id (or component-id when not in a set) → instance count across all pages. */
  byMainId: Record<string, number>;
  /** set-id → the names of the pages that hold at least one instance. */
  pagesById: Record<string, string[]>;
  /** Instances whose representative failed to resolve to a main (prototype's 'ERR'). */
  unresolved: number;
}

/** The whole raw scan — one JSON object the plugin returns for AUDIT_DS. */
export interface AuditDsFacts {
  /** `skippedPages`: pages whose setCurrentPageAsync failed (hydration error) — traversal
   *  skipped them, so usage counts are a LOWER BOUND whenever this is non-empty. */
  file: { fileName: string; pages: { id: string; name: string }[]; skippedPages: string[] };
  components: AuditComponentFact[];
  usage: AuditUsageFacts;
  counts: { components: number; sets: number; instancesTallied: number };
}
