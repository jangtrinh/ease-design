/**
 * Display/Toast — a stack of transient notifications.
 *
 * Axis: Tone (Neutral | Success | Danger). Each toast is the L8 popover pair
 * (`--color-popover` + `--color-popover-foreground`) lifted by the semantic `elevation.overlay`
 * shadow, with a solid left rail in the tone colour. Polite tones (neutral/success) announce via
 * `role="status"`; the urgent danger tone uses `role="alert"`. Every toast carries a text dismiss
 * button whose "×" glyph is named with `aria-label`. A leaf feedback surface, it declares
 * `State=Default`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-toast">
  <style>
    .ui-toast { display: grid; gap: var(--space-3); font-family: var(--font-family-body); max-width: 380px; }
    .ui-toast__item {
      display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); border-radius: var(--radius-card);
      background: var(--color-popover); color: var(--color-popover-foreground);
      border: 1px solid var(--color-border); border-left-width: 3px;
      box-shadow: var(--elevation-overlay-offset-x) var(--elevation-overlay-offset-y) var(--elevation-overlay-blur) var(--elevation-overlay-spread) var(--elevation-overlay-color);
    }
    .ui-toast__item--neutral { border-left-color: var(--color-secondary); }
    .ui-toast__item--success { border-left-color: var(--color-success); }
    .ui-toast__item--danger  { border-left-color: var(--color-danger); }
    .ui-toast__dot { width: 0.55em; height: 0.55em; margin-top: 0.4em; border-radius: var(--radius-full); }
    .ui-toast__item--neutral .ui-toast__dot { background: var(--color-secondary); }
    .ui-toast__item--success .ui-toast__dot { background: var(--color-success); }
    .ui-toast__item--danger  .ui-toast__dot { background: var(--color-danger); }
    .ui-toast__text { display: grid; gap: var(--space-1); }
    .ui-toast__title { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
    .ui-toast__body { font-size: var(--font-size-xs); color: var(--color-muted-foreground); line-height: 1.5; }
    .ui-toast__close {
      font: inherit; line-height: 1; cursor: pointer; flex: none;
      padding: var(--space-1); border-radius: var(--radius-button);
      border: 1px solid transparent; background: transparent; color: var(--color-muted-foreground);
    }
  </style>
  <div class="ui-toast__item ui-toast__item--neutral" role="status">
    <span class="ui-toast__dot" aria-hidden="true"></span>
    <div class="ui-toast__text">
      <p class="ui-toast__title">Draft saved</p>
      <p class="ui-toast__body">Your changes are saved to this device.</p>
    </div>
    <button type="button" class="ui-toast__close" aria-label="Dismiss notification">&times;</button>
  </div>
  <div class="ui-toast__item ui-toast__item--success" role="status">
    <span class="ui-toast__dot" aria-hidden="true"></span>
    <div class="ui-toast__text">
      <p class="ui-toast__title">Design system published</p>
      <p class="ui-toast__body">Version three is now available to your team.</p>
    </div>
    <button type="button" class="ui-toast__close" aria-label="Dismiss notification">&times;</button>
  </div>
  <div class="ui-toast__item ui-toast__item--danger" role="alert">
    <span class="ui-toast__dot" aria-hidden="true"></span>
    <div class="ui-toast__text">
      <p class="ui-toast__title">Upload failed</p>
      <p class="ui-toast__body">The file exceeds the 25 MB limit &mdash; try a smaller export.</p>
    </div>
    <button type="button" class="ui-toast__close" aria-label="Dismiss notification">&times;</button>
  </div>
</div>`;

export const toast: KitComponent = {
  name: "Display/Toast",
  category: "feedback",
  markup,
  description: "Toast notifications — neutral, success, and danger tones on a popover surface with overlay elevation and a named dismiss control.",
  status: "stable",
  variants: [
    "Tone=Neutral", "Tone=Success", "Tone=Danger",
    "State=Default",
  ],
  tokensUsed: [
    "color.popover", "color.popover-foreground", "color.border", "color.muted-foreground",
    "color.secondary", "color.success", "color.danger",
    "elevation.overlay-offset-x", "elevation.overlay-offset-y",
    "elevation.overlay-blur", "elevation.overlay-spread", "elevation.overlay-color",
    "radius.card", "radius.full", "radius.button",
    "font-family.body", "font-weight.semibold",
    "font-size.xs", "font-size.sm",
    "space.1", "space.3", "space.4",
  ],
};
