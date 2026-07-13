/**
 * Structure/Pagination — a page navigator inside `nav[aria-label="Pagination"]`.
 *
 * A `<ul>` of page links plus Previous/Next; the current page carries `aria-current="page"` on the
 * L8 `--color-primary` pair. Previous is the disabled demo (first page) — `aria-disabled` +
 * `tabindex="-1"`, muted. Hover uses the `--color-accent` pair, focus uses `--color-ring`; the
 * overflow gap is an `aria-hidden` ellipsis list item (content, not a control). States:
 * Default | Hover | Focus | Disabled, drawn statically.
 *
 * The leaf role `pagination` is in neither the control nor the data family, so the specimen
 * contract requires no gap — the honest matrix (including disabled) is declared anyway.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<nav class="ui-kit ui-pg" aria-label="Pagination">
  <style>
    .ui-pg { font-family: var(--font-family-body); font-size: var(--font-size-sm); }
    .ui-pg__list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
    .ui-pg__link {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 2.25rem; padding: var(--space-2) var(--space-3);
      color: var(--color-foreground); text-decoration: none; cursor: pointer;
      border: 1px solid transparent; border-radius: var(--radius-button);
      transition: background var(--duration-fast) ease, border-color var(--duration-fast) ease;
    }
    .ui-pg__link.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-pg__link.is-focus { outline: 2px solid var(--color-ring); outline-offset: 1px; }
    .ui-pg__link[aria-current="page"] { background: var(--color-primary); color: var(--color-primary-foreground); }
    .ui-pg__link[aria-disabled="true"] { color: var(--color-muted-foreground); opacity: 0.6; cursor: not-allowed; }
    .ui-pg__ellipsis { min-width: 2.25rem; text-align: center; color: var(--color-muted-foreground); user-select: none; }
  </style>
  <ul class="ui-pg__list">
    <li><a class="ui-pg__link" href="#" aria-disabled="true" tabindex="-1">Previous</a></li>
    <li><a class="ui-pg__link" href="#" aria-current="page">1</a></li>
    <li><a class="ui-pg__link is-hover" href="#">2</a></li>
    <li><a class="ui-pg__link is-focus" href="#">3</a></li>
    <li><a class="ui-pg__link" href="#">4</a></li>
    <li class="ui-pg__ellipsis" aria-hidden="true">…</li>
    <li><a class="ui-pg__link" href="#">12</a></li>
    <li><a class="ui-pg__link" href="#">Next</a></li>
  </ul>
</nav>`;

export const pagination: KitComponent = {
  name: "Structure/Pagination",
  category: "navigation",
  markup,
  description: "Pagination — a labelled nav with numbered page links, a current page, hover/focus states, and a disabled Previous control.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Disabled",
  ],
  tokensUsed: [
    "color.foreground", "color.accent", "color.accent-foreground", "color.ring",
    "color.primary", "color.primary-foreground", "color.muted-foreground",
    "radius.button",
    "font-family.body",
    "font-size.sm",
    "space.1", "space.2", "space.3",
    "duration.fast",
  ],
};
