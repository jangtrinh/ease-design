/**
 * Overlay/Popover — a non-modal panel anchored to a trigger, shown open.
 *
 * The trigger is a real `<button>` with visible text carrying `aria-expanded` + `aria-controls`;
 * the panel is a `role="dialog"` (NON-modal — no `aria-modal`) named by `aria-label`. Unlike
 * Dialog there is no scrim and focus is not trapped. The panel is the L8 popover pair
 * (`--color-popover` + `--color-popover-foreground`) on `--radius-card`, lifted by the semantic
 * `elevation.card` shadow, with a small border-triangle arrow. The panel floats inside a relative
 * stage that reserves its height so the specimen never overlaps its neighbours. States:
 * Default | Open (rendered open; `Open` normalises to no state, so — like Dialog/Tooltip — the
 * component participates in the contract through its `Default` state).
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-pop">
  <style>
    .ui-pop { font-family: var(--font-family-body); }
    .ui-pop__stage { position: relative; min-height: 190px; display: flex; justify-content: center; padding-top: var(--space-2); }
    .ui-pop__anchor { position: relative; }
    .ui-pop__trigger {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer;
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-button);
      background: var(--color-secondary); color: var(--color-secondary-foreground); border: 1px solid var(--color-border);
      transition: filter var(--duration-fast) ease;
    }
    .ui-pop__panel {
      position: absolute; top: calc(100% + var(--space-3)); left: 50%; transform: translateX(-50%);
      width: 264px; z-index: 1; display: grid; gap: var(--space-3);
      padding: var(--space-4); border-radius: var(--radius-card);
      background: var(--color-popover); color: var(--color-popover-foreground); border: 1px solid var(--color-border);
      box-shadow: var(--elevation-card-offset-x) var(--elevation-card-offset-y) var(--elevation-card-blur) var(--elevation-card-spread) var(--elevation-card-color);
    }
    .ui-pop__arrow {
      position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
      border: var(--space-1) solid transparent; border-bottom-color: var(--color-popover);
    }
    .ui-pop__title { font-family: var(--font-family-display); font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
    .ui-pop__body { font-size: var(--font-size-xs); color: var(--color-muted-foreground); line-height: 1.5; }
    .ui-pop__row { display: flex; gap: var(--space-2); }
    .ui-pop__btn {
      font: inherit; font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); cursor: pointer;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-button); border: 1px solid transparent;
      background: var(--color-primary); color: var(--color-primary-foreground);
    }
    .ui-pop__btn--ghost { background: transparent; color: var(--color-foreground); border-color: var(--color-border); }
  </style>
  <div class="ui-pop__stage">
    <div class="ui-pop__anchor">
      <button type="button" class="ui-pop__trigger" aria-expanded="true" aria-controls="ui-pop-panel">Share workspace</button>
      <div class="ui-pop__panel" id="ui-pop-panel" role="dialog" aria-label="Share workspace">
        <span class="ui-pop__arrow" aria-hidden="true"></span>
        <p class="ui-pop__title">Invite teammates</p>
        <p class="ui-pop__body">Anyone with the link can open this design system in read-only mode.</p>
        <div class="ui-pop__row">
          <button type="button" class="ui-pop__btn">Copy link</button>
          <button type="button" class="ui-pop__btn ui-pop__btn--ghost">Manage access</button>
        </div>
      </div>
    </div>
  </div>
</div>`;

export const popover: KitComponent = {
  name: "Overlay/Popover",
  category: "overlay",
  markup,
  description: "Popover — a non-modal role=dialog panel on a popover surface with card elevation, anchored to a text trigger via aria-controls.",
  status: "stable",
  variants: [
    "State=Default", "State=Open",
  ],
  tokensUsed: [
    "color.secondary", "color.secondary-foreground", "color.border",
    "color.popover", "color.popover-foreground", "color.muted-foreground",
    "color.primary", "color.primary-foreground", "color.foreground",
    "elevation.card-offset-x", "elevation.card-offset-y",
    "elevation.card-blur", "elevation.card-spread", "elevation.card-color",
    "radius.button", "radius.card",
    "font-family.body", "font-family.display",
    "font-weight.medium", "font-weight.semibold",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4",
  ],
};
