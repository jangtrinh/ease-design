/**
 * Display/Kbd — keyboard-key hints, single keys and combos.
 *
 * Axis: Keys (Single | Combo). Each key is a real `<kbd>` on the L8 `--color-muted` surface with
 * a `--color-border` hairline and `--radius-sm`. Glyphs like "⌘" and "⇧" are page CONTENT inside
 * `<kbd>` (not icon controls), so they need no accessible name of their own. A keycap is a leaf
 * display primitive with no interactive states — it declares `State=Static` (which normalises to
 * no state; it does not join the specimen contract).
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-kbd">
  <style>
    .ui-kbd { display: grid; gap: var(--space-3); font-family: var(--font-family-body); }
    .ui-kbd__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--color-foreground); }
    .ui-kbd__cap { min-width: 84px; font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-kbd__combo { display: inline-flex; align-items: center; gap: var(--space-1); }
    .ui-kbd__key {
      font-family: var(--font-family-body); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); line-height: 1;
      display: inline-flex; align-items: center; justify-content: center; min-width: 1.5em;
      padding: var(--space-1) var(--space-2);
      background: var(--color-muted); color: var(--color-foreground);
      border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    }
  </style>
  <div class="ui-kbd__row">
    <span class="ui-kbd__cap">Single</span>
    <kbd class="ui-kbd__key">Esc</kbd>
    <kbd class="ui-kbd__key">Enter</kbd>
    <kbd class="ui-kbd__key">/</kbd>
  </div>
  <div class="ui-kbd__row">
    <span class="ui-kbd__cap">Combo</span>
    <span class="ui-kbd__combo"><kbd class="ui-kbd__key">⌘</kbd><kbd class="ui-kbd__key">K</kbd></span>
    <span class="ui-kbd__combo"><kbd class="ui-kbd__key">⇧</kbd><kbd class="ui-kbd__key">⌘</kbd><kbd class="ui-kbd__key">P</kbd></span>
  </div>
</div>`;

export const kbd: KitComponent = {
  name: "Display/Kbd",
  category: "display",
  markup,
  description: "Keyboard key — single keys and multi-key combos on a muted keycap surface with radius-sm.",
  status: "stable",
  variants: [
    "Keys=Single", "Keys=Combo",
    "State=Static",
  ],
  tokensUsed: [
    "color.foreground", "color.muted-foreground", "color.muted", "color.border",
    "radius.sm",
    "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3",
  ],
};
