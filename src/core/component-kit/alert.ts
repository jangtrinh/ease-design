/**
 * Display/Alert — an inline message banner.
 *
 * Axis: Tone (Info | Success | Warning | Danger). Each tone tints its own surface with a
 * `color-mix` of the paired status colour into `--color-background` and carries a solid
 * left rail in the tone colour; body text stays on `--color-foreground`/`--color-muted-foreground`
 * so it clears AA on the light tint. Polite tones (info/success) use `role="status"`; urgent
 * tones (warning/danger) use `role="alert"`. Each banner has a title, message, and a text
 * action button. A leaf `alert` is not a control or data family, so it declares `State=Default`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-alert">
  <style>
    .ui-alert { display: grid; gap: var(--space-3); font-family: var(--font-family-body); max-width: 560px; }
    .ui-alert__box {
      display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); border-radius: var(--radius-card);
      border: 1px solid var(--color-border); border-left-width: 3px; color: var(--color-foreground);
    }
    .ui-alert__box--info    { background: color-mix(in srgb, var(--color-info) 10%, var(--color-background));    border-left-color: var(--color-info); }
    .ui-alert__box--success { background: color-mix(in srgb, var(--color-success) 10%, var(--color-background)); border-left-color: var(--color-success); }
    .ui-alert__box--warning { background: color-mix(in srgb, var(--color-warning) 12%, var(--color-background)); border-left-color: var(--color-warning); }
    .ui-alert__box--danger  { background: color-mix(in srgb, var(--color-danger) 10%, var(--color-background));  border-left-color: var(--color-danger); }
    .ui-alert__dot { width: 0.55em; height: 0.55em; margin-top: 0.4em; border-radius: var(--radius-full); }
    .ui-alert__box--info .ui-alert__dot { background: var(--color-info); }
    .ui-alert__box--success .ui-alert__dot { background: var(--color-success); }
    .ui-alert__box--warning .ui-alert__dot { background: var(--color-warning); }
    .ui-alert__box--danger .ui-alert__dot { background: var(--color-danger); }
    .ui-alert__text { display: grid; gap: var(--space-1); }
    .ui-alert__title { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
    .ui-alert__body { font-size: var(--font-size-xs); color: var(--color-muted-foreground); line-height: 1.5; }
    .ui-alert__action {
      font: inherit; font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); cursor: pointer;
      align-self: center; white-space: nowrap; padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-button); border: 1px solid var(--color-border);
      background: var(--color-background); color: var(--color-foreground);
      transition: background var(--duration-fast) ease;
    }
  </style>
  <div class="ui-alert__box ui-alert__box--info" role="status">
    <span class="ui-alert__dot" aria-hidden="true"></span>
    <div class="ui-alert__text">
      <p class="ui-alert__title">A new persona is available</p>
      <p class="ui-alert__body">Liquid Glass now ships with paired status tokens.</p>
    </div>
    <button type="button" class="ui-alert__action">View</button>
  </div>
  <div class="ui-alert__box ui-alert__box--success" role="status">
    <span class="ui-alert__dot" aria-hidden="true"></span>
    <div class="ui-alert__text">
      <p class="ui-alert__title">Design system compiled</p>
      <p class="ui-alert__body">21 components registered and specimen-checked.</p>
    </div>
    <button type="button" class="ui-alert__action">Details</button>
  </div>
  <div class="ui-alert__box ui-alert__box--warning" role="alert">
    <span class="ui-alert__dot" aria-hidden="true"></span>
    <div class="ui-alert__text">
      <p class="ui-alert__title">Trial ends in 3 days</p>
      <p class="ui-alert__body">Add a payment method to keep your workspace active.</p>
    </div>
    <button type="button" class="ui-alert__action">Add card</button>
  </div>
  <div class="ui-alert__box ui-alert__box--danger" role="alert">
    <span class="ui-alert__dot" aria-hidden="true"></span>
    <div class="ui-alert__text">
      <p class="ui-alert__title">Payment failed</p>
      <p class="ui-alert__body">We could not charge the card ending in 4242.</p>
    </div>
    <button type="button" class="ui-alert__action">Retry</button>
  </div>
</div>`;

export const alert: KitComponent = {
  name: "Display/Alert",
  category: "feedback",
  markup,
  description: "Inline alert banner — info, success, warning, and danger tones with a title, message, and action.",
  status: "stable",
  variants: [
    "Tone=Info", "Tone=Success", "Tone=Warning", "Tone=Danger",
    "State=Default",
  ],
  tokensUsed: [
    "color.foreground", "color.background", "color.border", "color.muted-foreground",
    "color.info", "color.success", "color.warning", "color.danger",
    "radius.card", "radius.full", "radius.button",
    "font-family.body", "font-weight.semibold", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.3", "space.4",
    "duration.fast",
  ],
};
