/**
 * Control/Button — the kit's action control.
 *
 * Axes: Tone (Primary | Secondary | Danger) × Size (Sm | Md | Lg) ×
 * State (Default | Hover | Focus | Disabled | Loading). The markup renders the
 * tone×state matrix at Md plus a size row, with every interaction state drawn
 * statically (`.is-hover`, `.is-focus`, `[disabled]`, `aria-busy`). Colours flow
 * only through the L8 semantic tier: secondary uses `--color-secondary`, its
 * hover tint uses `--color-accent`, focus uses `--color-ring`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-btn">
  <style>
    .ui-btn { display: grid; gap: var(--space-3); font-family: var(--font-family-body); }
    .ui-btn__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .ui-btn__cap { min-width: 84px; font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-btn__btn {
      font-family: inherit; font-weight: var(--font-weight-medium); font-size: var(--font-size-sm);
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-4); border: 1px solid transparent;
      border-radius: var(--radius-button); cursor: pointer;
      transition: background var(--duration-fast) ease, filter var(--duration-fast) ease;
    }
    .ui-btn__btn--sm { padding: var(--space-1) var(--space-3); font-size: var(--font-size-xs); }
    .ui-btn__btn--lg { padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); }
    .ui-btn__btn--primary { background: var(--color-primary); color: var(--color-primary-foreground); }
    .ui-btn__btn--primary.is-hover, .ui-btn__btn--primary:hover { background: var(--color-primary-hover); }
    .ui-btn__btn--secondary { background: var(--color-secondary); color: var(--color-secondary-foreground); }
    .ui-btn__btn--secondary.is-hover, .ui-btn__btn--secondary:hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-btn__btn--danger { background: var(--color-danger); color: var(--color-danger-foreground); }
    .ui-btn__btn--danger.is-hover, .ui-btn__btn--danger:hover { filter: brightness(0.92); }
    .ui-btn__btn.is-focus, .ui-btn__btn:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
    .ui-btn__btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-btn__spin {
      width: 1em; height: 1em; border-radius: var(--radius-full);
      border: 2px solid currentColor; border-top-color: transparent;
      animation: ui-btn-spin var(--duration-slow) linear infinite;
    }
    @keyframes ui-btn-spin { to { transform: rotate(360deg); } }
  </style>
  <div class="ui-btn__row">
    <span class="ui-btn__cap">Primary</span>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary">Save changes</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary is-hover">Save changes</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary is-focus">Save changes</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary" disabled>Save changes</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary" disabled aria-busy="true"><span class="ui-btn__spin" aria-hidden="true"></span>Saving</button>
  </div>
  <div class="ui-btn__row">
    <span class="ui-btn__cap">Secondary</span>
    <button type="button" class="ui-btn__btn ui-btn__btn--secondary">Cancel</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--secondary is-hover">Cancel</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--secondary is-focus">Cancel</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--secondary" disabled>Cancel</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--secondary" disabled aria-busy="true"><span class="ui-btn__spin" aria-hidden="true"></span>Working</button>
  </div>
  <div class="ui-btn__row">
    <span class="ui-btn__cap">Danger</span>
    <button type="button" class="ui-btn__btn ui-btn__btn--danger">Delete project</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--danger is-hover">Delete project</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--danger is-focus">Delete project</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--danger" disabled>Delete project</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--danger" disabled aria-busy="true"><span class="ui-btn__spin" aria-hidden="true"></span>Deleting</button>
  </div>
  <div class="ui-btn__row">
    <span class="ui-btn__cap">Sizes</span>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary ui-btn__btn--sm">Small</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary ui-btn__btn--md">Medium</button>
    <button type="button" class="ui-btn__btn ui-btn__btn--primary ui-btn__btn--lg">Large</button>
  </div>
</div>`;

export const button: KitComponent = {
  name: "Control/Button",
  category: "action",
  markup,
  description: "Action button — Primary/Secondary/Danger tones across three sizes and the full interaction-state matrix.",
  status: "stable",
  variants: [
    "Tone=Primary", "Tone=Secondary", "Tone=Danger",
    "Size=Sm", "Size=Md", "Size=Lg",
    "State=Default", "State=Hover", "State=Focus", "State=Disabled", "State=Loading",
  ],
  tokensUsed: [
    "color.primary", "color.primary-foreground", "color.primary-hover",
    "color.secondary", "color.secondary-foreground",
    "color.accent", "color.accent-foreground",
    "color.danger", "color.danger-foreground",
    "color.ring", "color.muted-foreground",
    "radius.button", "radius.full",
    "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm", "font-size.md",
    "space.1", "space.2", "space.3", "space.4", "space.5",
    "duration.fast", "duration.slow",
  ],
};
