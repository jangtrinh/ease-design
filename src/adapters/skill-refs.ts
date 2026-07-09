/**
 * Static mapping from workflow verb → skill names invoked by that workflow.
 *
 * Derived from each workflow's "What to read" / step sections in templates/.
 * Shared by the Claude and Antigravity adapter generators so both runtimes
 * always reference the same skill set per verb.
 */

export const VERB_SKILL_REFS: Readonly<Record<string, readonly string[]>> = {
  generate:  ["pick-persona", "score-taste", "check-consistency", "color-decision"],
  iterate:   ["apply-prompt-mode", "score-taste"],
  refine:    ["score-taste", "check-consistency"],
  redesign:  ["pick-persona", "score-taste", "color-decision"],
  extract:   ["token-model", "color-decision"],
  learn:     ["token-model", "color-decision"],
  why:       [],
  "from-ref":["apply-prompt-mode", "pick-persona"],
  "from-url":["pick-persona", "designmd-emit", "color-decision", "token-model"],
  figma:     ["apply-prompt-mode"],
  "to-figma":["figma-craft", "pick-persona", "score-taste"],
  design:    ["figma-craft", "pick-persona", "score-taste", "check-consistency"],
  slides:    ["pick-persona", "score-taste"],
  init:      [],
};
