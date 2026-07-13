/**
 * Control/Switch — a toggle drawn from a real (screen-reader-only) checkbox plus an
 * `aria-hidden` track/thumb; the wrapping `<label>` text is the accessible name. Same
 * family as Checkbox: Default | Hover | Focus | Checked | Disabled. Track-off is the L8
 * `--color-input` role, track-on is `--color-primary`, focus is `--color-ring`.
 *
 * Exported as `switchControl` — `switch` is a reserved word.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-switch">
  <style>
    .ui-switch { display: grid; gap: var(--space-2); font-family: var(--font-family-body); }
    .ui-switch__cap { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-switch__item { display: inline-flex; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--color-foreground); cursor: pointer; }
    .ui-switch__input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .ui-switch__track {
      position: relative; flex: none; width: 2.2em; height: 1.25em; border-radius: var(--radius-full);
      background: var(--color-input); transition: background var(--duration-base) ease;
    }
    .ui-switch__thumb {
      position: absolute; top: 50%; left: 0.15em; transform: translateY(-50%);
      width: 0.95em; height: 0.95em; border-radius: var(--radius-full); background: var(--color-background);
      transition: transform var(--duration-base) ease;
    }
    .ui-switch__input:checked + .ui-switch__track { background: var(--color-primary); }
    .ui-switch__input:checked + .ui-switch__track .ui-switch__thumb { transform: translate(0.95em, -50%); }
    .ui-switch__item.is-hover .ui-switch__track { background: color-mix(in srgb, var(--color-foreground) 20%, var(--color-input)); }
    .ui-switch__item.is-focus .ui-switch__track { outline: 2px solid var(--color-ring); outline-offset: 2px; }
    .ui-switch__item.is-disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
  <p class="ui-switch__cap">Security</p>
  <label class="ui-switch__item"><input class="ui-switch__input" type="checkbox"><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb"></span></span><span>Require two-factor auth</span></label>
  <label class="ui-switch__item is-hover"><input class="ui-switch__input" type="checkbox"><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb"></span></span><span>Require two-factor auth</span></label>
  <label class="ui-switch__item is-focus"><input class="ui-switch__input" type="checkbox"><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb"></span></span><span>Require two-factor auth</span></label>
  <label class="ui-switch__item"><input class="ui-switch__input" type="checkbox" checked><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb"></span></span><span>Auto-renew subscription</span></label>
  <label class="ui-switch__item is-disabled"><input class="ui-switch__input" type="checkbox" checked disabled><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb"></span></span><span>Managed by your admin</span></label>
</div>`;

export const switchControl: KitComponent = {
  name: "Control/Switch",
  category: "form",
  markup,
  description: "Toggle switch (accessible checkbox) with hover, focus, checked, and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Checked", "State=Disabled",
  ],
  tokensUsed: [
    "color.input", "color.primary", "color.background", "color.foreground",
    "color.ring", "color.muted-foreground",
    "radius.full", "font-family.body",
    "font-size.xs", "font-size.sm",
    "space.2", "space.3",
    "duration.base",
  ],
};
