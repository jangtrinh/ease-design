/**
 * Overlay/Tooltip — a static-open tooltip anchored to a text trigger.
 *
 * The trigger is a real `<button>` with visible text; it points at the bubble via
 * `aria-describedby`, and the bubble carries `role="tooltip"` with the matching `id`. The bubble
 * is the L8 popover pair (`--color-popover` + `--color-popover-foreground`) lifted by the
 * semantic `elevation.card` shadow, with a small border-triangle arrow. States: Default | Open
 * (rendered open; `Open` normalises to no state, so — like Dialog — the component participates in
 * the contract through its `Default` state).
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-tooltip">
  <style>
    .ui-tooltip { font-family: var(--font-family-body); display: flex; justify-content: center; padding: var(--space-8) var(--space-4) var(--space-4); }
    .ui-tooltip__anchor { position: relative; }
    .ui-tooltip__trigger {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: help;
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-button);
      background: var(--color-secondary); color: var(--color-secondary-foreground); border: 1px solid var(--color-border);
    }
    .ui-tooltip__pop {
      position: absolute; bottom: calc(100% + var(--space-2)); left: 50%; transform: translateX(-50%);
      white-space: nowrap; z-index: 1;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-card);
      background: var(--color-popover); color: var(--color-popover-foreground);
      font-size: var(--font-size-xs); line-height: 1.4;
      box-shadow: var(--elevation-card-offset-x) var(--elevation-card-offset-y) var(--elevation-card-blur) var(--elevation-card-spread) var(--elevation-card-color);
    }
    .ui-tooltip__arrow {
      position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
      border: var(--space-1) solid transparent; border-top-color: var(--color-popover);
    }
  </style>
  <span class="ui-tooltip__anchor">
    <button type="button" class="ui-tooltip__trigger" aria-describedby="ui-tooltip-desc">Keyboard shortcuts</button>
    <span class="ui-tooltip__pop" role="tooltip" id="ui-tooltip-desc">Press ⌘ K to open the command menu<span class="ui-tooltip__arrow" aria-hidden="true"></span></span>
  </span>
</div>`;

export const tooltip: KitComponent = {
  name: "Overlay/Tooltip",
  category: "overlay",
  markup,
  description: "Tooltip — a static-open popover bubble with card elevation, anchored to a text trigger via aria-describedby.",
  status: "stable",
  variants: [
    "State=Default", "State=Open",
  ],
  tokensUsed: [
    "color.secondary", "color.secondary-foreground", "color.border",
    "color.popover", "color.popover-foreground",
    "elevation.card-offset-x", "elevation.card-offset-y",
    "elevation.card-blur", "elevation.card-spread", "elevation.card-color",
    "radius.button", "radius.card",
    "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4", "space.8",
  ],
};
