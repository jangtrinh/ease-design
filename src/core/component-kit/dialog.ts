/**
 * Overlay/Dialog — a modal surface shown open, over a dimmed scrim.
 *
 * The surface is the L8 popover pair (`--color-popover` + `--color-popover-foreground`) on
 * `--radius-card`, lifted by the semantic `elevation.overlay` shadow (its `--elevation-overlay-*`
 * members). The scrim is a `color-mix` of the semantic `--color-scrim` veil toward transparent. The modal
 * carries `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`/`aria-describedby`; the
 * icon close button is named with `aria-label`. States: Default | Open (rendered open).
 *
 * A leaf `dialog` is neither a control nor a data family, so no `disabled`/`empty` gap is required.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-dialog">
  <style>
    .ui-dialog { font-family: var(--font-family-body); }
    .ui-dialog__stage { position: relative; min-height: var(--space-16); padding: var(--space-8) var(--space-4); border-radius: var(--radius-card); overflow: hidden; background: var(--color-muted); }
    .ui-dialog__scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--color-scrim) 45%, transparent); }
    .ui-dialog__modal {
      position: relative; margin: 0 auto; max-width: 380px; display: grid; gap: var(--space-4);
      padding: var(--space-5); background: var(--color-popover); color: var(--color-popover-foreground);
      border-radius: var(--radius-card);
      box-shadow: var(--elevation-overlay-offset-x) var(--elevation-overlay-offset-y) var(--elevation-overlay-blur) var(--elevation-overlay-spread) var(--elevation-overlay-color);
    }
    .ui-dialog__head { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
    .ui-dialog__title { font-family: var(--font-family-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
    .ui-dialog__close {
      font: inherit; line-height: 1; cursor: pointer; flex: none;
      padding: var(--space-1); border-radius: var(--radius-button);
      border: 1px solid transparent; background: transparent; color: var(--color-muted-foreground);
    }
    .ui-dialog__close.is-focus { outline: 2px solid var(--color-ring); outline-offset: 1px; }
    .ui-dialog__body { font-size: var(--font-size-sm); color: var(--color-muted-foreground); line-height: 1.5; }
    .ui-dialog__actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
    .ui-dialog__btn {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer;
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-button); border: 1px solid transparent;
      transition: filter var(--duration-fast) ease;
    }
    .ui-dialog__btn--secondary { background: var(--color-secondary); color: var(--color-secondary-foreground); }
    .ui-dialog__btn--danger { background: var(--color-danger); color: var(--color-danger-foreground); }
  </style>
  <div class="ui-dialog__stage">
    <div class="ui-dialog__scrim" aria-hidden="true"></div>
    <div class="ui-dialog__modal" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" aria-describedby="ui-dialog-desc">
      <div class="ui-dialog__head">
        <p class="ui-dialog__title" id="ui-dialog-title">Delete project</p>
        <button type="button" class="ui-dialog__close" aria-label="Close dialog">&times;</button>
      </div>
      <p class="ui-dialog__body" id="ui-dialog-desc">This permanently removes the Aurora project and all of its compiled tokens. This action cannot be undone.</p>
      <div class="ui-dialog__actions">
        <button type="button" class="ui-dialog__btn ui-dialog__btn--secondary">Cancel</button>
        <button type="button" class="ui-dialog__btn ui-dialog__btn--danger">Delete project</button>
      </div>
    </div>
  </div>
</div>`;

export const dialog: KitComponent = {
  name: "Overlay/Dialog",
  category: "overlay",
  markup,
  description: "Modal dialog — a popover surface with overlay elevation over a dimmed scrim, with header, body, and confirm/cancel actions.",
  status: "stable",
  variants: [
    "State=Default", "State=Open",
  ],
  tokensUsed: [
    "color.muted", "color.scrim",
    "color.popover", "color.popover-foreground", "color.muted-foreground", "color.ring",
    "color.secondary", "color.secondary-foreground",
    "color.danger", "color.danger-foreground",
    "elevation.overlay-offset-x", "elevation.overlay-offset-y",
    "elevation.overlay-blur", "elevation.overlay-spread", "elevation.overlay-color",
    "radius.card", "radius.button",
    "font-family.body", "font-family.display",
    "font-weight.semibold", "font-weight.medium",
    "font-size.lg", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4", "space.5", "space.8", "space.16",
    "duration.fast",
  ],
};
