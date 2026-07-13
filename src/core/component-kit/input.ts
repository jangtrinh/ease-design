/**
 * Control/Input — single-line text field with a label.
 *
 * State (Default | Hover | Focus | Invalid | Disabled). Every field ships a real
 * `<label for>`; the invalid field wires `aria-invalid` + `aria-describedby` to its
 * error text. Border strength is the L8 `--color-input` role; focus is `--color-ring`;
 * the invalid affordance is `--color-danger`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-input">
  <style>
    .ui-input { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); font-family: var(--font-family-body); }
    .ui-input__field { display: grid; gap: var(--space-1); }
    .ui-input__label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-foreground); }
    .ui-input__ctrl {
      font: inherit; font-size: var(--font-size-sm); width: 100%;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-button);
      border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-foreground);
      transition: border-color var(--duration-fast) ease;
    }
    .ui-input__ctrl.is-hover:not([disabled]) { border-color: color-mix(in srgb, var(--color-foreground) 35%, var(--color-input)); }
    .ui-input__ctrl.is-focus { border-color: var(--color-ring); outline: 2px solid color-mix(in srgb, var(--color-ring) 35%, transparent); outline-offset: 1px; }
    .ui-input__ctrl.is-invalid { border-color: var(--color-danger); }
    .ui-input__ctrl[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-input__help { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-input__help.is-error { color: var(--color-danger); }
  </style>
  <div class="ui-input__field">
    <label class="ui-input__label" for="ui-input-default">Workspace name</label>
    <input class="ui-input__ctrl" id="ui-input-default" type="text" value="Aurora Labs">
    <p class="ui-input__help">Shown on invoices and exports.</p>
  </div>
  <div class="ui-input__field">
    <label class="ui-input__label" for="ui-input-hover">Hovered</label>
    <input class="ui-input__ctrl is-hover" id="ui-input-hover" type="text" value="ease-design">
    <p class="ui-input__help">Border strengthens on pointer.</p>
  </div>
  <div class="ui-input__field">
    <label class="ui-input__label" for="ui-input-focus">Focused</label>
    <input class="ui-input__ctrl is-focus" id="ui-input-focus" type="text" value="ease-design">
    <p class="ui-input__help">Ring at 35% strength.</p>
  </div>
  <div class="ui-input__field">
    <label class="ui-input__label" for="ui-input-invalid">Invalid</label>
    <input class="ui-input__ctrl is-invalid" id="ui-input-invalid" type="email" value="not-an-email" aria-invalid="true" aria-describedby="ui-input-invalid-err">
    <p class="ui-input__help is-error" id="ui-input-invalid-err">Enter a valid email address.</p>
  </div>
  <div class="ui-input__field">
    <label class="ui-input__label" for="ui-input-disabled">Disabled</label>
    <input class="ui-input__ctrl" id="ui-input-disabled" type="text" value="Managed by SSO" disabled>
    <p class="ui-input__help">Provisioned by your identity provider.</p>
  </div>
</div>`;

export const input: KitComponent = {
  name: "Control/Input",
  category: "form",
  markup,
  description: "Labelled single-line text field with hover, focus, invalid, and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Invalid", "State=Disabled",
  ],
  tokensUsed: [
    "color.input", "color.background", "color.foreground",
    "color.ring", "color.danger", "color.muted-foreground",
    "radius.button", "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4",
    "duration.fast",
  ],
};
