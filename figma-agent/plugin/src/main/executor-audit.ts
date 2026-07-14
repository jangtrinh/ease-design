// Plugin op AUDIT_DS — gather RAW DS-hygiene facts in ONE pass; make NO judgment.
// Every flag/cluster/summary is computed later by the pure CLI detect core
// (cli/src/commands/audit-ds-detect.ts), unit-tested on fixtures with no live Figma.
//
// The five dynamic-page constraints below each cost a real bug — they are baked in,
// not to be rediscovered. Each is tagged (Cn) where it bites in the code.
//  (C1) instance.mainComponent (sync) THROWS under dynamic-page → getMainComponentAsync().
//  (C2) figma.root.children pages are lazy stubs → setCurrentPageAsync(page) before traverse.
//  (C3) The WS bridge drops on heavy scans (>160k instances) → per page, sync-tally
//       instances by node.name, then resolve ONE rep per distinct name. (Name-only tally is
//       false-safe: a renamed instance — StepItem→"Step 1/2/3" — undercounts toward 0.)
//  (C4) Map a resolved main → its parent COMPONENT_SET; tally usage at the SET level.
//  (C5) Cross-page node refs go stale under dynamic-page → resolve on the page we stand on;
//       never stash a node to resolve later, and keep only plain objects after leaving a page.
import type {
  AuditComponentFact, AuditDsFacts, AuditUsageFacts,
} from '../../../shared/audit-types';

/** Count SOLID paints on `node[field]` that are NOT bound to a color variable. */
function countUnboundPaints(node: SceneNode, field: 'fills' | 'strokes'): number {
  if (!(field in node)) return 0;
  let paints: unknown;
  try {
    paints = (node as unknown as Record<string, unknown>)[field];
  } catch {
    return 0; // reading the field threw — nothing countable
  }
  // figma.mixed (a symbol) or a missing value is not an array → treat as 0 for this node.
  if (!Array.isArray(paints)) return 0;
  let n = 0;
  for (const p of paints as Paint[]) {
    if (p.type === 'SOLID' && !p.boundVariables?.color) n++;
  }
  return n;
}

/** A single COMPONENT/COMPONENT_SET node → its raw fact (no verdicts). */
function factForNode(n: ComponentNode | ComponentSetNode, pageName: string): AuditComponentFact {
  // variantAxes + variantCount — componentPropertyDefinitions THROWS on a malformed set → {}.
  let variantAxes: Record<string, string[]> = {};
  try {
    const defs = (n as ComponentSetNode).componentPropertyDefinitions;
    for (const [prop, def] of Object.entries(defs)) {
      if (def.type === 'VARIANT') variantAxes[prop] = def.variantOptions ?? [];
    }
  } catch {
    variantAxes = {};
  }
  const variantCount = n.type === 'COMPONENT_SET' ? n.children.length : 0;

  // (C5) section: climb parents to the nearest SECTION — resolved now, on this page.
  let section: string | null = null;
  let p: BaseNode | null = n.parent;
  while (p) {
    if (p.type === 'SECTION') { section = p.name; break; }
    p = p.parent;
  }

  const deprecatedData = n.getSharedPluginData('idp', 'status') === 'deprecated';

  // Representative node = a SET's first variant, else the component itself.
  const rep: SceneNode | undefined = n.type === 'COMPONENT_SET' ? n.children[0] : n;
  const repChildren: SceneNode[] = rep && 'children' in rep
    ? [...(rep as ChildrenMixin).children]
    : [];
  const childTypeSignature = repChildren.map((c) => c.type);

  // unbound SOLID paints on rep + its DIRECT children only (v1 cost bound — root+direct is signal enough).
  let unboundFills = 0;
  let unboundStrokes = 0;
  for (const s of rep ? [rep, ...repChildren] : []) {
    unboundFills += countUnboundPaints(s, 'fills');
    unboundStrokes += countUnboundPaints(s, 'strokes');
  }

  return {
    id: n.id,
    key: n.key ?? null,
    name: n.name,
    type: n.type,
    variantCount,
    variantAxes,
    pageName,
    section,
    deprecatedData,
    childTypeSignature,
    unboundFills,
    unboundStrokes,
  };
}

/** Inventory the COMPONENT / COMPONENT_SET nodes on ONE (already-current) page. */
function inventoryPage(page: PageNode): AuditComponentFact[] {
  const nodes = page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
  const facts: AuditComponentFact[] = [];
  for (const n of nodes) {
    // A COMPONENT that is a direct variant child of a SET is already covered by the set (C4-adjacent).
    if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
    facts.push(factForNode(n, page.name));
  }
  return facts;
}

/** Tally instance usage on ONE (already-current) page into the shared usage accumulator. */
async function tallyUsagePage(page: PageNode, usage: AuditUsageFacts): Promise<number> {
  // (C3) Sync-collect first: count by name + keep ONE live rep per distinct name. Doing ZERO
  // async work inside findAll keeps node refs fresh and the WS bridge alive on huge files.
  const cnt: Record<string, number> = {};
  const reps: Record<string, InstanceNode> = {};
  page.findAll((node) => {
    if (node.type === 'INSTANCE') {
      cnt[node.name] = (cnt[node.name] ?? 0) + 1;
      reps[node.name] ??= node;
    }
    return false; // side-effect tally only — never actually collect
  });

  let tallied = 0;
  for (const name of Object.keys(reps)) {
    const c = cnt[name];
    tallied += c;
    let key: ComponentNode | ComponentSetNode | null = null;
    try {
      // (C1) the sync mainComponent throws under dynamic-page — async is the only safe read.
      const main = await reps[name].getMainComponentAsync();
      // (C4) tally at the SET level: the set is the unit users pick a variant from.
      if (main) key = main.parent && main.parent.type === 'COMPONENT_SET' ? (main.parent as ComponentSetNode) : main;
    } catch {
      key = null;
    }
    if (key) {
      usage.byMainId[key.id] = (usage.byMainId[key.id] ?? 0) + c;
      const pages = (usage.pagesById[key.id] ??= []);
      if (!pages.includes(page.name)) pages.push(page.name);
    } else {
      usage.unresolved += c; // (C3) resolve failure — surfaced so the detector can hedge "unused"
    }
  }
  return tallied;
}

/** AUDIT_DS entry: one raw-facts pass over every page (inventory + usage), no verdicts. */
export async function auditDs(): Promise<AuditDsFacts> {
  const pages = figma.root.children; // (C2) lazy stubs until setCurrentPageAsync
  const components: AuditComponentFact[] = [];
  const usage: AuditUsageFacts = { byMainId: {}, pagesById: {}, unresolved: 0 };
  const skippedPages: string[] = [];
  let instancesTallied = 0;

  for (const page of pages) {
    // (C2) hydrate the page before ANY traversal; (C5) do BOTH passes here, before leaving it.
    // Hydration can fail on a broken/huge page (the proven prototype skips too) — skip and
    // RECORD it: a silently missing page would undercount usage and mislabel comps "unused".
    try {
      await figma.setCurrentPageAsync(page);
    } catch {
      skippedPages.push(page.name);
      continue;
    }
    components.push(...inventoryPage(page));
    instancesTallied += await tallyUsagePage(page, usage);
  }

  const componentCount = components.filter((c) => c.type === 'COMPONENT').length;
  const sets = components.filter((c) => c.type === 'COMPONENT_SET').length;
  return {
    // Only plain objects survive past a page boundary (C5) — no SceneNode is retained.
    file: {
      fileName: figma.root.name,
      pages: pages.map((pg) => ({ id: pg.id, name: pg.name })),
      skippedPages,
    },
    components,
    usage,
    counts: { components: componentCount, sets, instancesTallied },
  };
}
