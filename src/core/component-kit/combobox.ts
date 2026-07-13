/**
 * Control/Combobox — a labelled text input paired with a filtered listbox.
 *
 * The control is an `<input role="combobox">` with `aria-expanded`, `aria-controls`,
 * `aria-autocomplete="list"`, and `aria-activedescendant` pointing at the active option; the popup
 * is a `role="listbox"` of `role="option"` items, one `aria-selected="true"`. The default field is
 * shown open (input `.is-focus`) with a hovered option; a second field renders the static
 * "No matches" empty listbox; a third is the disabled control. Surfaces are the L8 popover pair on
 * `--radius-card` with `elevation.card`. States: Default | Hover | Focus | Empty | Disabled.
 *
 * The leaf role `combobox` is in BOTH families — a DATA container (needs `empty`) AND a form
 * CONTROL (interactive, so needs `disabled`). It declares both, satisfying every applicable gap.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-cb">
  <style>
    .ui-cb { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-5); font-family: var(--font-family-body); }
    .ui-cb__field { display: grid; gap: var(--space-1); align-content: start; }
    .ui-cb__label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-foreground); }
    .ui-cb__input {
      font: inherit; font-size: var(--font-size-sm); width: 100%; appearance: none; -webkit-appearance: none;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-button);
      border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-foreground);
      transition: border-color var(--duration-fast) ease;
    }
    .ui-cb__input.is-focus { border-color: var(--color-ring); outline: 2px solid color-mix(in srgb, var(--color-ring) 35%, transparent); outline-offset: 1px; }
    .ui-cb__input[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-cb__list {
      list-style: none; margin: var(--space-1) 0 0; padding: var(--space-1);
      background: var(--color-popover); color: var(--color-popover-foreground);
      border: 1px solid var(--color-border); border-radius: var(--radius-card);
      box-shadow: var(--elevation-card-offset-x) var(--elevation-card-offset-y) var(--elevation-card-blur) var(--elevation-card-spread) var(--elevation-card-color);
    }
    .ui-cb__opt { font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
    .ui-cb__opt[aria-selected="true"] { background: var(--color-accent); color: var(--color-accent-foreground); font-weight: var(--font-weight-medium); }
    .ui-cb__opt.is-hover { background: var(--color-muted); }
    .ui-cb__empty { margin: var(--space-1) 0 0; padding: var(--space-3); font-size: var(--font-size-sm); color: var(--color-muted-foreground); }
  </style>
  <div class="ui-cb__field">
    <label class="ui-cb__label" for="ui-cb-1">Search fruit</label>
    <input class="ui-cb__input is-focus" id="ui-cb-1" role="combobox" aria-expanded="true" aria-controls="ui-cb-list-1" aria-autocomplete="list" aria-activedescendant="ui-cb-o2" value="Ber">
    <ul class="ui-cb__list" id="ui-cb-list-1" role="listbox" aria-label="Fruit">
      <li class="ui-cb__opt" id="ui-cb-o1" role="option">Apple</li>
      <li class="ui-cb__opt" id="ui-cb-o2" role="option" aria-selected="true">Berry</li>
      <li class="ui-cb__opt is-hover" id="ui-cb-o3" role="option">Blueberry</li>
    </ul>
  </div>
  <div class="ui-cb__field">
    <label class="ui-cb__label" for="ui-cb-2">Search tags</label>
    <input class="ui-cb__input" id="ui-cb-2" role="combobox" aria-expanded="true" aria-controls="ui-cb-list-2" aria-autocomplete="list" value="qz">
    <div class="ui-cb__list" id="ui-cb-list-2" role="listbox" aria-label="Tags">
      <p class="ui-cb__empty">No matches found</p>
    </div>
  </div>
  <div class="ui-cb__field">
    <label class="ui-cb__label" for="ui-cb-3">Assigned to</label>
    <input class="ui-cb__input" id="ui-cb-3" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-disabled="true" value="Managed by SSO" disabled>
  </div>
</div>`;

export const combobox: KitComponent = {
  name: "Control/Combobox",
  category: "form",
  markup,
  description: "Combobox — a labelled role=combobox input with a listbox of options (one selected), plus static empty and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Empty", "State=Disabled",
  ],
  tokensUsed: [
    "color.foreground", "color.input", "color.background", "color.ring",
    "color.popover", "color.popover-foreground", "color.border",
    "color.accent", "color.accent-foreground", "color.muted", "color.muted-foreground",
    "elevation.card-offset-x", "elevation.card-offset-y",
    "elevation.card-blur", "elevation.card-spread", "elevation.card-color",
    "radius.button", "radius.card", "radius.sm",
    "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.5",
    "duration.fast",
  ],
};
