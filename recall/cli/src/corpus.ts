/**
 * Corpus intake — recall NEVER parses the ledger itself.
 *
 * It shells out to the deterministic binary's pure seam
 * (`ui memory export-corpus --since <id> --json`) and consumes the payloads it
 * emits. That keeps exactly one implementation of "what is embeddable", and it is
 * the one covered by the root test suite.
 *
 * Boundary invariant #3: knowledge only ever flows BACK through
 * `ui memory record insight` — never by writing the ledger from here.
 */
import { spawnSync } from "node:child_process";

import type { Tier } from "./store.ts";

/** One payload as emitted by `ui memory export-corpus`. */
export interface CorpusPayload {
  id: string;
  tier: Tier;
  text: string;
  refs: string[];
  t: string;
}

/** Override the binary (tests + non-PATH installs): `UI_BIN=node …/cli.js`. */
function uiBin(): string[] {
  const env = process.env["UI_BIN"];
  return env !== undefined && env.trim().length > 0 ? env.trim().split(/\s+/) : ["ui"];
}

export class CorpusError extends Error {}

/**
 * Fetch every embeddable payload recorded after `sinceId` (all of them when
 * `sinceId` is null — a cold index).
 */
export function fetchCorpus(projectDir: string | undefined, sinceId: string | null): CorpusPayload[] {
  const [cmd, ...prefix] = uiBin() as [string, ...string[]];
  const args = [...prefix, "memory", "export-corpus", "--json"];
  if (sinceId !== null) args.push("--since", sinceId);
  if (projectDir !== undefined) args.push("--dir", projectDir);

  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.error !== undefined) {
    throw new CorpusError(
      `cannot run '${cmd}': ${res.error.message}. Is the ui binary on PATH (npm link) — or set UI_BIN?`,
    );
  }
  if (res.status !== 0) {
    throw new CorpusError(`'${cmd} memory export-corpus' exited ${String(res.status)}: ${res.stderr || res.stdout}`);
  }

  let envelope: { ok?: boolean; data?: { items?: unknown } };
  try {
    envelope = JSON.parse(res.stdout) as typeof envelope;
  } catch {
    throw new CorpusError(`'${cmd} memory export-corpus --json' did not emit JSON`);
  }
  const items = envelope.data?.items;
  if (!Array.isArray(items)) throw new CorpusError("export-corpus envelope has no data.items array");
  return items as CorpusPayload[];
}

/** `"e12"` → 12; null when not a monotonic event id. */
export function eventIdNumber(id: string): number | null {
  const m = /^e(\d+)$/.exec(id);
  return m === null ? null : Number.parseInt(m[1] as string, 10);
}

/** The highest event id in a batch — what we pin as `lastIndexedId`. */
export function maxEventId(payloads: readonly CorpusPayload[]): string | null {
  let best: string | null = null;
  let bestN = -1;
  for (const p of payloads) {
    const n = eventIdNumber(p.id);
    if (n !== null && n > bestN) {
      bestN = n;
      best = p.id;
    }
  }
  return best;
}

/**
 * The entity a payload is *about*, used for supersession. Only token rationales
 * carry one today: a later change to the same token path demotes the earlier
 * rationale. `export-corpus` renders them as `Token <path> changed from …`.
 */
export function entityOf(p: CorpusPayload): string | undefined {
  const m = /^Token (\S+) changed from /.exec(p.text);
  return m === null ? undefined : `token:${m[1] as string}`;
}
