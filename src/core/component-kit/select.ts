/**
 * Control/Select — native `<select>` restyled to the token system.
 *
 * The specimen contract reads the leaf role `select` as a DATA-family control, so this
 * declares `State=Empty` (a placeholder-selected field) alongside the interaction states
 * Default | Hover | Focus | Disabled. The chevron is drawn with CSS borders (no image, no
 * hex); border is `--color-input`, focus is `--color-ring`, the empty value reads muted.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-select">
  <style>
    .ui-select { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); font-family: var(--font-family-body); }
    .ui-select__field { display: grid; gap: var(--space-1); }
    .ui-select__label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-foreground); }
    .ui-select__wrap { position: relative; }
    .ui-select__wrap::after {
      content: ""; position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%);
      width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent;
      border-top: 5px solid var(--color-muted-foreground); pointer-events: none;
    }
    .ui-select__ctrl {
      font: inherit; font-size: var(--font-size-sm); width: 100%; appearance: none; -webkit-appearance: none;
      padding: var(--space-2) var(--space-6) var(--space-2) var(--space-3); border-radius: var(--radius-button);
      border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-foreground);
      transition: border-color var(--duration-fast) ease;
    }
    .ui-select__ctrl.is-hover:not([disabled]) { border-color: color-mix(in srgb, var(--color-foreground) 35%, var(--color-input)); }
    .ui-select__ctrl.is-focus { border-color: var(--color-ring); outline: 2px solid color-mix(in srgb, var(--color-ring) 35%, transparent); outline-offset: 1px; }
    .ui-select__ctrl.is-empty { color: var(--color-muted-foreground); }
    .ui-select__ctrl[disabled] { opacity: 0.5; cursor: not-allowed; }
  </style>
  <div class="ui-select__field">
    <label class="ui-select__label" for="ui-select-default">Plan</label>
    <div class="ui-select__wrap">
      <select class="ui-select__ctrl" id="ui-select-default"><option>Starter</option><option selected>Team</option><option>Enterprise</option></select>
    </div>
  </div>
  <div class="ui-select__field">
    <label class="ui-select__label" for="ui-select-hover">Hovered</label>
    <div class="ui-select__wrap">
      <select class="ui-select__ctrl is-hover" id="ui-select-hover"><option selected>Team</option><option>Enterprise</option></select>
    </div>
  </div>
  <div class="ui-select__field">
    <label class="ui-select__label" for="ui-select-focus">Focused</label>
    <div class="ui-select__wrap">
      <select class="ui-select__ctrl is-focus" id="ui-select-focus"><option selected>Team</option><option>Enterprise</option></select>
    </div>
  </div>
  <div class="ui-select__field">
    <label class="ui-select__label" for="ui-select-empty">Empty</label>
    <div class="ui-select__wrap">
      <select class="ui-select__ctrl is-empty" id="ui-select-empty"><option value="" disabled selected>Choose a plan</option><option>Starter</option><option>Team</option></select>
    </div>
  </div>
  <div class="ui-select__field">
    <label class="ui-select__label" for="ui-select-disabled">Disabled</label>
    <div class="ui-select__wrap">
      <select class="ui-select__ctrl" id="ui-select-disabled" disabled><option selected>Managed by SSO</option></select>
    </div>
  </div>
</div>`;

export const select: KitComponent = {
  name: "Control/Select",
  category: "form",
  markup,
  description: "Native select restyled to tokens — Default/Hover/Focus/Disabled plus a placeholder Empty state.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Empty", "State=Disabled",
  ],
  tokensUsed: [
    "color.input", "color.background", "color.foreground",
    "color.ring", "color.muted-foreground",
    "radius.button", "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4", "space.6",
    "duration.fast",
  ],
};
