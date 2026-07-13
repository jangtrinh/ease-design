/**
 * Control/Radio — native radios sharing a `name`, grouped in a `<fieldset>` with a
 * `<legend>` (the group's accessible name). Brand tint via `accent-color`. States:
 * Default | Hover | Focus | Checked | Disabled. Hover uses `--color-accent`, focus `--color-ring`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<fieldset class="ui-kit ui-radio">
  <style>
    .ui-radio { border: 0; margin: 0; padding: 0; display: grid; gap: var(--space-1); font-family: var(--font-family-body); }
    .ui-radio__legend { padding: 0; font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-radio__item {
      display: inline-flex; align-items: center; gap: var(--space-3);
      padding: var(--space-1) var(--space-2); border-radius: var(--radius-button);
      font-size: var(--font-size-sm); color: var(--color-foreground); cursor: pointer;
    }
    .ui-radio__dot { width: 1.05em; height: 1.05em; accent-color: var(--color-primary); }
    .ui-radio__item.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-radio__item.is-focus .ui-radio__dot { outline: 2px solid var(--color-ring); outline-offset: 2px; }
    .ui-radio__item.is-disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
  <legend class="ui-radio__legend">Billing cycle</legend>
  <label class="ui-radio__item"><input class="ui-radio__dot" type="radio" name="ui-radio-cycle">Monthly</label>
  <label class="ui-radio__item is-hover"><input class="ui-radio__dot" type="radio" name="ui-radio-cycle">Quarterly</label>
  <label class="ui-radio__item is-focus"><input class="ui-radio__dot" type="radio" name="ui-radio-cycle">Biannual</label>
  <label class="ui-radio__item"><input class="ui-radio__dot" type="radio" name="ui-radio-cycle" checked>Annual (save 20%)</label>
  <label class="ui-radio__item is-disabled"><input class="ui-radio__dot" type="radio" name="ui-radio-cycle" disabled>Lifetime (sold out)</label>
</fieldset>`;

export const radio: KitComponent = {
  name: "Control/Radio",
  category: "form",
  markup,
  description: "Fieldset-grouped radios with hover, focus, checked, and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Checked", "State=Disabled",
  ],
  tokensUsed: [
    "color.primary", "color.foreground",
    "color.accent", "color.accent-foreground",
    "color.ring", "color.muted-foreground",
    "radius.button", "font-family.body",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3",
  ],
};
