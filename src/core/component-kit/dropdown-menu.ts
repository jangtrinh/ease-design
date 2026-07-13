/**
 * Overlay/DropdownMenu — a trigger and its actions menu, shown open.
 *
 * The trigger is a real `<button>` with `aria-haspopup="menu"`, `aria-expanded`, and
 * `aria-controls`; the menu is a `role="menu"` named back by `aria-labelledby` (the trigger's id).
 * Each action is a `role="menuitem"` `<button>` with roving `tabindex="-1"`; one item is
 * `aria-disabled`, and a `role="separator"` rule groups the destructive action apart. Item hover
 * uses the L8 `--color-accent` pair and focus uses `--color-ring`, drawn statically. The caret is a
 * CSS border-triangle (no glyph). The menu floats inside a relative stage that reserves its height.
 * States: Default | Open | Hover | Focus | Disabled.
 *
 * The leaf role `dropdownmenu` matches neither the control family (`menuitem`, not the container)
 * nor the data family (`menu`/`dropdown` singular), so the specimen contract requires no gap — the
 * honest matrix (including disabled) is declared anyway.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-dm">
  <style>
    .ui-dm { font-family: var(--font-family-body); }
    .ui-dm__stage { position: relative; min-height: 210px; display: flex; justify-content: center; padding-top: var(--space-2); }
    .ui-dm__anchor { position: relative; }
    .ui-dm__trigger {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer;
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-button);
      background: var(--color-secondary); color: var(--color-secondary-foreground); border: 1px solid var(--color-border);
    }
    .ui-dm__caret { flex: none; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid currentColor; }
    .ui-dm__menu {
      position: absolute; top: calc(100% + var(--space-2)); left: 50%; transform: translateX(-50%);
      min-width: 208px; z-index: 1; padding: var(--space-1); display: grid; gap: 1px;
      background: var(--color-popover); color: var(--color-popover-foreground);
      border: 1px solid var(--color-border); border-radius: var(--radius-card);
      box-shadow: var(--elevation-overlay-offset-x) var(--elevation-overlay-offset-y) var(--elevation-overlay-blur) var(--elevation-overlay-spread) var(--elevation-overlay-color);
    }
    .ui-dm__item {
      font: inherit; font-size: var(--font-size-sm); cursor: pointer; text-align: left; width: 100%;
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-sm);
      background: transparent; color: var(--color-popover-foreground);
      transition: background var(--duration-fast) ease;
    }
    .ui-dm__item.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-dm__item.is-focus { outline: 2px solid var(--color-ring); outline-offset: -2px; }
    .ui-dm__item[aria-disabled="true"] { color: var(--color-muted-foreground); cursor: not-allowed; opacity: 0.7; }
    .ui-dm__sep { height: 1px; margin: var(--space-1) 0; background: var(--color-border); }
  </style>
  <div class="ui-dm__stage">
    <div class="ui-dm__anchor">
      <button type="button" class="ui-dm__trigger" id="ui-dm-trigger" aria-haspopup="menu" aria-expanded="true" aria-controls="ui-dm-menu">Options<span class="ui-dm__caret" aria-hidden="true"></span></button>
      <div class="ui-dm__menu" id="ui-dm-menu" role="menu" aria-labelledby="ui-dm-trigger">
        <button type="button" class="ui-dm__item" role="menuitem" tabindex="-1">Edit</button>
        <button type="button" class="ui-dm__item is-hover" role="menuitem" tabindex="-1">Duplicate</button>
        <button type="button" class="ui-dm__item is-focus" role="menuitem" tabindex="-1">Move to project</button>
        <div class="ui-dm__sep" role="separator"></div>
        <button type="button" class="ui-dm__item" role="menuitem" aria-disabled="true" tabindex="-1">Archive</button>
      </div>
    </div>
  </div>
</div>`;

export const dropdownMenu: KitComponent = {
  name: "Overlay/DropdownMenu",
  category: "overlay",
  markup,
  description: "Dropdown menu — a labelled role=menu of menuitem actions with a separator and a disabled item, drawn open with static hover and focus.",
  status: "stable",
  variants: [
    "State=Default", "State=Open", "State=Hover", "State=Focus", "State=Disabled",
  ],
  tokensUsed: [
    "color.secondary", "color.secondary-foreground", "color.border",
    "color.popover", "color.popover-foreground",
    "color.accent", "color.accent-foreground", "color.ring", "color.muted-foreground",
    "elevation.overlay-offset-x", "elevation.overlay-offset-y",
    "elevation.overlay-blur", "elevation.overlay-spread", "elevation.overlay-color",
    "radius.button", "radius.card", "radius.sm",
    "font-family.body", "font-weight.medium",
    "font-size.sm",
    "space.1", "space.2", "space.3", "space.4",
    "duration.fast",
  ],
};
