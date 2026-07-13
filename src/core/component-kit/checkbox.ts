/**
 * Control/Checkbox — native checkbox tinted to the brand via `accent-color`, wrapped in
 * an implicit `<label>` (the text IS the accessible name). States: Default | Hover | Focus
 * | Checked | Disabled. Hover uses the L8 `--color-accent` tint; focus uses `--color-ring`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-check">
  <style>
    .ui-check { display: grid; gap: var(--space-1); font-family: var(--font-family-body); }
    .ui-check__hint { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-check__item {
      display: inline-flex; align-items: center; gap: var(--space-3);
      padding: var(--space-1) var(--space-2); border-radius: var(--radius-button);
      font-size: var(--font-size-sm); color: var(--color-foreground); cursor: pointer;
    }
    .ui-check__box { width: 1.05em; height: 1.05em; accent-color: var(--color-primary); }
    .ui-check__item.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-check__item.is-focus .ui-check__box { outline: 2px solid var(--color-ring); outline-offset: 2px; }
    .ui-check__item.is-disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
  <p class="ui-check__hint">Notifications</p>
  <label class="ui-check__item"><input class="ui-check__box" type="checkbox">Email me product updates</label>
  <label class="ui-check__item is-hover"><input class="ui-check__box" type="checkbox">Email me product updates</label>
  <label class="ui-check__item is-focus"><input class="ui-check__box" type="checkbox">Email me product updates</label>
  <label class="ui-check__item"><input class="ui-check__box" type="checkbox" checked>Subscribed to security alerts</label>
  <label class="ui-check__item is-disabled"><input class="ui-check__box" type="checkbox" checked disabled>Enforced by your admin</label>
</div>`;

export const checkbox: KitComponent = {
  name: "Control/Checkbox",
  category: "form",
  markup,
  description: "Brand-tinted checkbox with hover, focus, checked, and disabled states.",
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
