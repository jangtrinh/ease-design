/**
 * Control/Textarea — multi-line text field. Same state family as Input
 * (Default | Hover | Focus | Invalid | Disabled), same L8 token roles: `--color-input`
 * border, `--color-ring` focus, `--color-danger` invalid. Always labelled; the invalid
 * field wires `aria-invalid` + `aria-describedby`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-textarea">
  <style>
    .ui-textarea { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-4); font-family: var(--font-family-body); }
    .ui-textarea__field { display: grid; gap: var(--space-1); }
    .ui-textarea__label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-foreground); }
    .ui-textarea__ctrl {
      font: inherit; font-size: var(--font-size-sm); width: 100%; min-height: var(--space-16); resize: vertical;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-button);
      border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-foreground);
      transition: border-color var(--duration-fast) ease;
    }
    .ui-textarea__ctrl.is-hover:not([disabled]) { border-color: color-mix(in srgb, var(--color-foreground) 35%, var(--color-input)); }
    .ui-textarea__ctrl.is-focus { border-color: var(--color-ring); outline: 2px solid color-mix(in srgb, var(--color-ring) 35%, transparent); outline-offset: 1px; }
    .ui-textarea__ctrl.is-invalid { border-color: var(--color-danger); }
    .ui-textarea__ctrl[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-textarea__help { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-textarea__help.is-error { color: var(--color-danger); }
  </style>
  <div class="ui-textarea__field">
    <label class="ui-textarea__label" for="ui-textarea-default">Release notes</label>
    <textarea class="ui-textarea__ctrl" id="ui-textarea-default">Ship the compiled token set.</textarea>
    <p class="ui-textarea__help">Markdown supported.</p>
  </div>
  <div class="ui-textarea__field">
    <label class="ui-textarea__label" for="ui-textarea-hover">Hovered</label>
    <textarea class="ui-textarea__ctrl is-hover" id="ui-textarea-hover">Border strengthens on pointer.</textarea>
    <p class="ui-textarea__help">Pointer over the field.</p>
  </div>
  <div class="ui-textarea__field">
    <label class="ui-textarea__label" for="ui-textarea-focus">Focused</label>
    <textarea class="ui-textarea__ctrl is-focus" id="ui-textarea-focus">Ring at 35% strength.</textarea>
    <p class="ui-textarea__help">Keyboard focus.</p>
  </div>
  <div class="ui-textarea__field">
    <label class="ui-textarea__label" for="ui-textarea-invalid">Invalid</label>
    <textarea class="ui-textarea__ctrl is-invalid" id="ui-textarea-invalid" aria-invalid="true" aria-describedby="ui-textarea-invalid-err"></textarea>
    <p class="ui-textarea__help is-error" id="ui-textarea-invalid-err">Release notes are required.</p>
  </div>
  <div class="ui-textarea__field">
    <label class="ui-textarea__label" for="ui-textarea-disabled">Disabled</label>
    <textarea class="ui-textarea__ctrl" id="ui-textarea-disabled" disabled>Locked after publish.</textarea>
    <p class="ui-textarea__help">Read-only once released.</p>
  </div>
</div>`;

export const textarea: KitComponent = {
  name: "Control/Textarea",
  category: "form",
  markup,
  description: "Labelled multi-line text field with hover, focus, invalid, and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Invalid", "State=Disabled",
  ],
  tokensUsed: [
    "color.input", "color.background", "color.foreground",
    "color.ring", "color.danger", "color.muted-foreground",
    "radius.button", "font-family.body", "font-weight.medium",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4", "space.16",
    "duration.fast",
  ],
};
