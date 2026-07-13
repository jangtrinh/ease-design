/**
 * Display/Separator — a hairline divider, horizontal and vertical.
 *
 * Axis: Orientation (Horizontal | Vertical). Pure structural token — a single `--color-border`
 * hairline, no fill or foreground. Each rule carries `role="separator"` plus an explicit
 * `aria-orientation` so assistive tech announces the grouping boundary. A separator is a leaf
 * primitive with no interactive or data states — it declares `State=Static` (which normalises to
 * no state; it does not join the specimen contract).
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-sep">
  <style>
    .ui-sep { display: grid; gap: var(--space-5); font-family: var(--font-family-body); color: var(--color-foreground); }
    .ui-sep__cap { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-sep__stack { display: grid; gap: var(--space-3); }
    .ui-sep__label { font-size: var(--font-size-sm); }
    .ui-sep__line { height: 1px; background: var(--color-border); }
    .ui-sep__row { display: flex; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); }
    .ui-sep__v { align-self: stretch; width: 1px; min-height: var(--space-4); background: var(--color-border); }
  </style>
  <div class="ui-sep__stack">
    <p class="ui-sep__cap">Horizontal</p>
    <p class="ui-sep__label">Billing details</p>
    <div class="ui-sep__line" role="separator" aria-orientation="horizontal"></div>
    <p class="ui-sep__label">Payment method</p>
  </div>
  <div class="ui-sep__stack">
    <p class="ui-sep__cap">Vertical</p>
    <div class="ui-sep__row">
      <span>Overview</span>
      <span class="ui-sep__v" role="separator" aria-orientation="vertical"></span>
      <span>Activity</span>
      <span class="ui-sep__v" role="separator" aria-orientation="vertical"></span>
      <span>Settings</span>
    </div>
  </div>
</div>`;

export const separator: KitComponent = {
  name: "Display/Separator",
  category: "display",
  markup,
  description: "Hairline separator — horizontal and vertical rules on the border token, each with role and aria-orientation.",
  status: "stable",
  variants: [
    "Orientation=Horizontal", "Orientation=Vertical",
    "State=Static",
  ],
  tokensUsed: [
    "color.foreground", "color.muted-foreground", "color.border",
    "font-family.body",
    "font-size.xs", "font-size.sm",
    "space.3", "space.4", "space.5",
  ],
};
