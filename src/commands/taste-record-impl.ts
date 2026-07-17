/**
 * `ui taste record` — append one validated pair vote or study verdict.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  resolveTasteRoot, loadItems, appendVote, appendStudy, rootHasStore, TasteLedgerError,
  isPairWinner, isVerdict, WINNERS, VERDICTS,
} from "../core/taste-store.js";
import type { PairVote, StudyRecord } from "../core/taste-store.js";
import { withOutcome } from "../core/memory-autorecord.js";

const CMD = "taste record";

export function runTasteRecord(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const mode = parsed.flags["mode"];
  if (mode !== "pair" && mode !== "study") return err("E_TASTE_BAD_FLAGS", "--mode pair|study is required");

  const root = resolveTasteRoot(parsed);
  if (typeof root !== "string") return err("E_TASTE_BAD_FLAGS", root.err);
  if (!rootHasStore(root)) return err("E_TASTE_ROOT", `no taste store at '${root}' — run 'ui taste ingest' first`);

  let items;
  try {
    items = loadItems(root);
  } catch (e) {
    if (e instanceof TasteLedgerError) return err("E_TASTE_LEDGER", e.message);
    throw e;
  }
  const knownIds = new Set(items.map((it) => it.id));
  const ts = new Date().toISOString();

  if (mode === "pair") {
    const a = parsed.flags["a"], b = parsed.flags["b"], winner = parsed.flags["winner"];
    if (typeof a !== "string" || typeof b !== "string" || typeof winner !== "string") {
      return err("E_TASTE_BAD_FLAGS", "--a, --b, and --winner are required for --mode pair");
    }
    if (a === b) return err("E_TASTE_BAD_VOTE", "--a and --b must reference different items");
    if (!isPairWinner(winner)) return err("E_TASTE_BAD_VOTE", `--winner must be one of ${WINNERS.join("|")}`);
    if (!knownIds.has(a)) return err("E_TASTE_UNKNOWN_ITEM", `unknown item id '${a}'`);
    if (!knownIds.has(b)) return err("E_TASTE_UNKNOWN_ITEM", `unknown item id '${b}'`);

    const reasonsFlag = parsed.flags["reasons"];
    const reasons = typeof reasonsFlag === "string"
      ? reasonsFlag.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : [];
    const msFlag = parsed.flags["ms"];
    let ms: number | undefined;
    if (typeof msFlag === "string") {
      const n = Number(msFlag);
      if (Number.isNaN(n)) return err("E_TASTE_BAD_FLAGS", "--ms must be numeric");
      ms = n;
    }

    const vote: PairVote = { v: 1, ts, mode: "pair", a, b, winner, reasons, swapped: parsed.flags["swapped"] === true };
    const note = parsed.flags["note"]; if (typeof note === "string") vote.note = note;
    const repeatOf = parsed.flags["repeat-of"]; if (typeof repeatOf === "string") vote.repeatOf = repeatOf;
    if (ms !== undefined) vote.ms = ms;

    appendVote(root, vote);
    const out = useJson ? okJson(CMD, { recorded: vote }) : ok(`recorded pair vote: ${a} vs ${b} -> ${winner}\n`);
    // No projectDir: the taste root is a separate tree from design/, so there is no
    // artifact to point at — cwd fallback stays (see memory-autorecord.ts header).
    return withOutcome(out, parsed, { type: "taste_vote", actor: "ui taste record", data: { a, b, winner } });
  }

  // mode === "study"
  const item = parsed.flags["item"], verdict = parsed.flags["verdict"];
  if (typeof item !== "string" || typeof verdict !== "string") {
    return err("E_TASTE_BAD_FLAGS", "--item and --verdict are required for --mode study");
  }
  if (!isVerdict(verdict)) return err("E_TASTE_BAD_VOTE", `--verdict must be one of ${VERDICTS.join("|")}`);
  if (!knownIds.has(item)) return err("E_TASTE_UNKNOWN_ITEM", `unknown item id '${item}'`);

  const blindFlag = parsed.flags["blind-verdict"];
  if (blindFlag !== undefined && (typeof blindFlag !== "string" || !isVerdict(blindFlag))) {
    return err("E_TASTE_BAD_VOTE", `--blind-verdict must be one of ${VERDICTS.join("|")}`);
  }

  const study: StudyRecord = { v: 1, ts, mode: "study", item, verdict };
  if (typeof blindFlag === "string" && isVerdict(blindFlag)) study.blindVerdict = blindFlag;
  const note = parsed.flags["note"]; if (typeof note === "string") study.note = note;
  const lessonRef = parsed.flags["lesson-ref"]; if (typeof lessonRef === "string") study.lessonRef = lessonRef;

  appendStudy(root, study);
  return useJson ? okJson(CMD, { recorded: study }) : ok(`recorded study verdict: ${item} -> ${verdict}\n`);
}
