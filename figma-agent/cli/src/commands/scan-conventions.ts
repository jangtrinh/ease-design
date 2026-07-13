// `figma-agent scan-conventions <sectionId...> [--out usage-dna.json] [--budget N]`
//
// The convention-DNA walk (C7 part B): productionizes the proven in-plugin
// exec-js walk. For each SECTION node id it walks the section's screens in the
// plugin, AGGREGATING per-section (never dumping node metadata over the wire),
// and returns ONE compact `usage-dna.json` summary per section:
//   { section, screens, nodesWalked, truncated, fills:{bound,raw,tokenizedPct},
//     layout:{autolayoutFrames,rawFrames}, topComponents, radiusHist, spacingHist,
//     fonts, sampleScreens }
//
// Why a plugin walk and not an MCP dump: aggregating in the plugin returns a few
// hundred tokens; an MCP get_metadata / get_design_context dump of a whole
// section can be ~242k tokens (~85× larger). See knowledge/figma-agent-hand.md
// → "Whole-section reads: distil in the plugin, never dump".
//
// The node budget is capped PER SECTION and truncation is reported explicitly —
// a walk that hits the cap is surfaced in `truncated`, never silently clipped.
//
// LIVE-E2E: the walk itself needs the plugin open (proven live this session);
// the arg parsing, walk-code construction, and truncation reporting are
// unit-tested with a stub runner.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import { runWithWarmRetry } from '../transport/warm-retry.ts';

/** Default per-section node-visit budget (matches the proven seed walk). */
export const DEFAULT_BUDGET = 14_000;
/** Default per-attempt plugin-walk timeout; --timeout <ms> overrides it. */
export const DEFAULT_WALK_TIMEOUT_MS = 90_000;
const WIRE_MARGIN_MS = 2_000;

/** A command runner: the EXEC_JS transport call, injectable so the walk is testable. */
export type Runner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

/** One section's aggregated convention DNA (the usage-dna.json element shape). */
export interface SectionDNA {
  /** The section node's name (absent on a missing id). */
  section?: string;
  /** Present + true when the id resolved to no section-like node. */
  missing?: boolean;
  id?: string;
  screens?: number;
  nodesWalked?: number;
  truncated?: boolean;
  fills?: { bound: number; raw: number; tokenizedPct: number };
  layout?: { autolayoutFrames: number; rawFrames: number };
  topComponents?: Record<string, number>;
  radiusHist?: Record<string, number>;
  spacingHist?: Record<string, number>;
  fonts?: Record<string, number>;
  sampleScreens?: Array<{ name: string; layout: string; gap: number | null }>;
}

/**
 * Build the plugin-side walk code for the given section ids + per-section budget.
 * Pure (no I/O) so tests can assert the ids/budget are embedded and the walk
 * aggregates rather than serialises nodes. Faithfully ports the proven seed walk.
 */
export function buildWalkCode(sectionIds: string[], budget: number): string {
  return `
const SECTIONS = ${JSON.stringify(sectionIds)};
const PER_SECTION_BUDGET = ${JSON.stringify(budget)};
function pushHist(h, v){ if(v==null||typeof v!=='number') return; const k=String(Math.round(v)); h[k]=(h[k]||0)+1; }
const top = o => Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,12));
const out = [];
for (const sid of SECTIONS){
  const sec = await figma.getNodeByIdAsync(sid);
  if(!sec || !('children' in sec)){ out.push({ id: sid, missing: true }); continue; }
  const screens = sec.children.filter(c => c.type === 'FRAME');
  const comp = {}, radius = {}, spacing = {}, fonts = {};
  let boundFills = 0, rawFills = 0, autoFrames = 0, noneFrames = 0, visited = 0;
  const sample = [];
  for (const screen of screens){
    if (visited > PER_SECTION_BUDGET) break;
    if (sample.length < 6) sample.push({ name: screen.name.slice(0,46), layout: screen.layoutMode || 'NONE', gap: (typeof screen.itemSpacing === 'number' ? screen.itemSpacing : null) });
    const stack = [screen];
    while (stack.length && visited < PER_SECTION_BUDGET){
      const n = stack.pop(); visited++;
      if ('layoutMode' in n){ if (n.layoutMode && n.layoutMode !== 'NONE'){ autoFrames++; pushHist(spacing, n.itemSpacing); } else if (n.type === 'FRAME'){ noneFrames++; } }
      if ('cornerRadius' in n) pushHist(radius, n.cornerRadius);
      if (n.type === 'INSTANCE') comp[n.name] = (comp[n.name]||0) + 1;
      if ('fills' in n && Array.isArray(n.fills)){
        for (let i=0;i<n.fills.length;i++){ const f = n.fills[i]; if (f && f.type === 'SOLID'){ const b = n.boundVariables && n.boundVariables.fills && n.boundVariables.fills[i]; if (b) boundFills++; else rawFills++; } }
      }
      if (n.type === 'TEXT' && n.fontName && n.fontName !== figma.mixed){ fonts[n.fontName.family] = (fonts[n.fontName.family]||0) + 1; }
      if ('children' in n) for (const c of n.children) stack.push(c);
    }
  }
  out.push({ section: sec.name, screens: screens.length, nodesWalked: visited, truncated: visited >= PER_SECTION_BUDGET,
    fills: { bound: boundFills, raw: rawFills, tokenizedPct: Math.round(100 * boundFills / ((boundFills + rawFills) || 1)) },
    layout: { autolayoutFrames: autoFrames, rawFrames: noneFrames },
    topComponents: top(comp), radiusHist: radius, spacingHist: top(spacing), fonts, sampleScreens: sample });
}
return out;
`.trim();
}

/**
 * Run the convention-DNA walk over the given sections and return one DNA object
 * per section. `runner` defaults to the real broker transport and is injected in
 * unit tests. Reads only the compact aggregate off the wire (EXEC_JS `.result`).
 */
export async function scanConventions(
  sectionIds: string[],
  budget: number,
  runner: Runner = runCommand,
  walkTimeoutMs: number = DEFAULT_WALK_TIMEOUT_MS,
): Promise<SectionDNA[]> {
  const code = buildWalkCode(sectionIds, budget);
  // Cold big-file walks can exceed the timeout on the first pass; retry once warm.
  const reply = (await runWithWarmRetry(() =>
    runner('EXEC_JS', { code, timeoutMs: walkTimeoutMs }, { timeoutMs: walkTimeoutMs + WIRE_MARGIN_MS }),
  )) as { result?: unknown } | null;
  const result = reply && typeof reply === 'object' ? (reply as { result?: unknown }).result : undefined;
  if (!Array.isArray(result)) {
    throw new CliError('E_EVAL', 'scan-conventions walk did not return a section array');
  }
  return result as SectionDNA[];
}

export interface ScanConventionsResult {
  /** Written file path (only when --out was given). */
  path?: string;
  /** Number of section ids requested. */
  sections: number;
  /** Section NAMES whose walk hit the per-section budget (reported, never silently capped). */
  truncated: string[];
  /** Section IDS that did not resolve to a walkable section node. */
  missing: string[];
  /** The full DNA array (only when --out was NOT given — else it is in the file). */
  dna?: SectionDNA[];
}

/**
 * Full command flow, decoupled from CommandArgs + the real transport so it is
 * unit-testable with a stub runner and a temp --out path.
 */
export async function execute(
  sectionIds: string[],
  budget: number,
  outPath: string | undefined,
  runner: Runner = runCommand,
  walkTimeoutMs: number = DEFAULT_WALK_TIMEOUT_MS,
): Promise<ScanConventionsResult> {
  if (sectionIds.length === 0) {
    throw new CliError('E_INVALID_ARGS', 'scan-conventions requires at least one <sectionId>');
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new CliError('E_INVALID_ARGS', `--budget must be a positive number, got "${budget}"`);
  }
  const dna = await scanConventions(sectionIds, budget, runner, walkTimeoutMs);
  const truncated = dna.filter((s) => s.truncated === true).map((s) => s.section ?? s.id ?? '?');
  const missing = dna.filter((s) => s.missing === true).map((s) => s.id ?? '?');

  if (outPath !== undefined) {
    const abs = resolve(outPath);
    writeFileSync(abs, JSON.stringify(dna, null, 2));
    return { path: abs, sections: sectionIds.length, truncated, missing };
  }
  return { sections: sectionIds.length, truncated, missing, dna };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const sectionIds = args.positionals;
  const budget = args.num('budget') ?? DEFAULT_BUDGET;
  const outPath = args.str('out');
  const walkTimeoutMs = args.num('timeout') ?? DEFAULT_WALK_TIMEOUT_MS;
  return execute(sectionIds, budget, outPath, runCommand, walkTimeoutMs);
}
