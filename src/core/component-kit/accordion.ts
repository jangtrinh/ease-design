/**
 * Structure/Accordion — a stack of disclosure sections, one shown statically expanded.
 *
 * Each header is a real `<button>` carrying `aria-expanded` and `aria-controls`; the panel it
 * controls is a `role="region"` named back by `aria-labelledby` (the button's id). The first item
 * is expanded (its panel visible); the rest are collapsed (`aria-expanded="false"`, panel `hidden`)
 * and demo the interaction states — `.is-hover` on the L8 `--color-accent` pair, `.is-focus` via
 * `--color-ring`, and a `disabled` header. The caret is a CSS border-triangle (no glyph) that
 * rotates on `aria-expanded="true"` via `transform` (never a layout property, so no keyframes and
 * no reduced-motion guard is needed). States: Default | Expanded | Hover | Focus | Disabled.
 *
 * The leaf role `accordion` is in neither the control nor the data family, so the specimen contract
 * requires no `disabled`/`empty` gap — the honest matrix (including disabled) is declared anyway.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-acc">
  <style>
    .ui-acc { font-family: var(--font-family-body); display: grid; gap: var(--space-2); max-width: 520px; }
    .ui-acc__item { border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-background); overflow: hidden; }
    .ui-acc__trigger {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer;
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3) var(--space-4); border: 0; background: transparent; color: var(--color-foreground); text-align: left;
      transition: background var(--duration-fast) ease;
    }
    .ui-acc__trigger.is-hover:not([disabled]) { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-acc__trigger.is-focus { outline: 2px solid var(--color-ring); outline-offset: -2px; }
    .ui-acc__trigger[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-acc__caret {
      flex: none; width: 0; height: 0;
      border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid var(--color-muted-foreground);
      transition: transform var(--duration-fast) ease;
    }
    .ui-acc__trigger[aria-expanded="true"] .ui-acc__caret { transform: rotate(180deg); }
    .ui-acc__panel { padding: 0 var(--space-4) var(--space-4); font-size: var(--font-size-sm); color: var(--color-muted-foreground); line-height: 1.5; }
  </style>
  <div class="ui-acc__item">
    <button type="button" class="ui-acc__trigger" id="ui-acc-t1" aria-expanded="true" aria-controls="ui-acc-p1">Order details<span class="ui-acc__caret" aria-hidden="true"></span></button>
    <div class="ui-acc__panel" id="ui-acc-p1" role="region" aria-labelledby="ui-acc-t1">
      <p>Two items ship from the Rotterdam warehouse and arrive Thursday. Tracking updates land in your inbox as each parcel moves.</p>
    </div>
  </div>
  <div class="ui-acc__item">
    <button type="button" class="ui-acc__trigger is-hover" id="ui-acc-t2" aria-expanded="false" aria-controls="ui-acc-p2">Shipping and returns<span class="ui-acc__caret" aria-hidden="true"></span></button>
    <div class="ui-acc__panel" id="ui-acc-p2" role="region" aria-labelledby="ui-acc-t2" hidden>
      <p>Free returns within thirty days of delivery.</p>
    </div>
  </div>
  <div class="ui-acc__item">
    <button type="button" class="ui-acc__trigger is-focus" id="ui-acc-t3" aria-expanded="false" aria-controls="ui-acc-p3">Payment methods<span class="ui-acc__caret" aria-hidden="true"></span></button>
    <div class="ui-acc__panel" id="ui-acc-p3" role="region" aria-labelledby="ui-acc-t3" hidden>
      <p>Cards, bank transfer, and store credit are accepted at checkout.</p>
    </div>
  </div>
  <div class="ui-acc__item">
    <button type="button" class="ui-acc__trigger" id="ui-acc-t4" aria-expanded="false" aria-controls="ui-acc-p4" disabled>Gift cards<span class="ui-acc__caret" aria-hidden="true"></span></button>
    <div class="ui-acc__panel" id="ui-acc-p4" role="region" aria-labelledby="ui-acc-t4" hidden>
      <p>Gift cards are unavailable in this region.</p>
    </div>
  </div>
</div>`;

export const accordion: KitComponent = {
  name: "Structure/Accordion",
  category: "navigation",
  markup,
  description: "Accordion — disclosure sections with aria-expanded button headers and labelled regions, one expanded plus hover/focus/disabled headers.",
  status: "stable",
  variants: [
    "State=Default", "State=Expanded", "State=Hover", "State=Focus", "State=Disabled",
  ],
  tokensUsed: [
    "color.border", "color.background", "color.foreground",
    "color.accent", "color.accent-foreground", "color.ring", "color.muted-foreground",
    "radius.card",
    "font-family.body", "font-weight.medium",
    "font-size.sm",
    "space.2", "space.3", "space.4",
    "duration.fast",
  ],
};
