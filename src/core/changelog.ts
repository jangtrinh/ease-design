/**
 * Design changelog (DESIGN-OS T1) — a human- AND model-readable history of what the
 * design system changed, folded from two sources that already exist:
 *   - the DS manifest's `changelog[]` (init / change-token / register)
 *   - the memory ledger's recorded `insight` events (the *decisions*, with provenance)
 *
 * Keep a Changelog style, reverse-chronological, each line provenance-tagged. Pure:
 * the impl reads the files, this module folds parsed arrays.
 */
import type { DSChangelogEntry } from "./ds-manifest.js";

export type ChangeType = "Added" | "Changed" | "Decisions";

export interface ChangelogEntry {
  date: string; // ISO date (YYYY-MM-DD)
  type: ChangeType;
  text: string;
  provenance?: string;
}
export interface ChangelogModel {
  entries: ChangelogEntry[];
}

/** A recorded decision from the memory ledger (an `insight` event). */
export interface DecisionInput {
  t: string;
  text: string;
  refs?: string[];
}

function isoDate(ts: string): string {
  const d = ts.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ts;
}

export function buildChangelog(
  dsChangelog: readonly DSChangelogEntry[],
  decisions: readonly DecisionInput[] = [],
): ChangelogModel {
  const entries: ChangelogEntry[] = [];

  for (const c of dsChangelog) {
    const date = isoDate(c.ts);
    const by = c.by;
    if (c.kind === "init") {
      entries.push({ date, type: "Added", text: c.note ?? "Compiled the design system", provenance: by });
    } else if (c.kind === "register") {
      entries.push({ date, type: "Added", text: c.note ?? "Registered a component", provenance: by });
    } else if (c.kind === "change-token") {
      const path = c.path ?? "(token)";
      const move = c.from !== undefined && c.to !== undefined ? `: ${c.from} → ${c.to}` : "";
      const why = c.reason !== undefined ? ` — ${c.reason}` : "";
      entries.push({ date, type: "Changed", text: `Token ${path}${move}${why}`, provenance: by });
    } else if (c.kind === "set-role") {
      const path = c.path ?? "(token)";
      const move = c.from !== undefined ? `${c.from} → ${c.to}` : `${c.to}`;
      entries.push({ date, type: "Changed", text: `Role ${path}: ${move}`, provenance: by });
    }
  }

  for (const d of decisions) {
    entries.push({
      date: isoDate(d.t),
      type: "Decisions",
      text: d.text,
      ...(d.refs !== undefined && d.refs.length > 0 ? { provenance: `refs ${d.refs.join(",")}` } : {}),
    });
  }

  // Newest first; stable within a date so equal-date entries keep insertion order.
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { entries };
}

const ORDER: ChangeType[] = ["Added", "Changed", "Decisions"];

export function renderMarkdown(model: ChangelogModel, name?: string): string {
  const lines: string[] = [`# Changelog${name !== undefined ? ` — ${name}` : ""}`, "",
    "Design-system history, folded from the DS manifest changelog and recorded decisions.", ""];
  if (model.entries.length === 0) {
    lines.push("_No changes recorded yet._", "");
    return lines.join("\n") + "\n";
  }
  for (const type of ORDER) {
    const group = model.entries.filter((e) => e.type === type);
    if (group.length === 0) continue;
    lines.push(`## ${type}`, "");
    for (const e of group) {
      const prov = e.provenance !== undefined ? ` <sub>(${e.date} · ${e.provenance})</sub>` : ` <sub>(${e.date})</sub>`;
      lines.push(`- ${e.text}${prov}`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
