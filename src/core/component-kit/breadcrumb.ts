/**
 * Structure/Breadcrumb — a hierarchical trail inside `nav[aria-label="Breadcrumb"]`.
 *
 * The trail is an ordered `<ol>`; each ancestor is a real `<a>` and the final crumb is a plain
 * `<span>` marked `aria-current="page"` (it is the current location, not a link). The `/`
 * separators are their own `aria-hidden` list items so assistive tech reads the trail, not the
 * punctuation. Hover/focus are runtime `:hover`/`:focus-visible` affordances (not a declared
 * static matrix), so — like Separator/Kbd/Avatar — the component declares `State=Static`, which
 * normalises to no state and does not join the specimen contract.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<nav class="ui-kit ui-bc" aria-label="Breadcrumb">
  <style>
    .ui-bc { font-family: var(--font-family-body); font-size: var(--font-size-sm); }
    .ui-bc__list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .ui-bc__link { color: var(--color-muted-foreground); text-decoration: none; border-radius: var(--radius-sm); transition: color var(--duration-fast) ease; }
    .ui-bc__link:hover { color: var(--color-foreground); text-decoration: underline; }
    .ui-bc__link:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; color: var(--color-foreground); }
    .ui-bc__sep { color: var(--color-muted-foreground); user-select: none; }
    .ui-bc__current { color: var(--color-foreground); font-weight: var(--font-weight-medium); }
  </style>
  <ol class="ui-bc__list">
    <li><a class="ui-bc__link" href="#">Home</a></li>
    <li class="ui-bc__sep" aria-hidden="true">/</li>
    <li><a class="ui-bc__link" href="#">Design systems</a></li>
    <li class="ui-bc__sep" aria-hidden="true">/</li>
    <li><a class="ui-bc__link" href="#">Aurora</a></li>
    <li class="ui-bc__sep" aria-hidden="true">/</li>
    <li><span class="ui-bc__current" aria-current="page">Tokens</span></li>
  </ol>
</nav>`;

export const breadcrumb: KitComponent = {
  name: "Structure/Breadcrumb",
  category: "navigation",
  markup,
  description: "Breadcrumb — a labelled nav with an ordered trail, aria-hidden separators, and the current page marked aria-current.",
  status: "stable",
  variants: [
    "State=Static",
  ],
  tokensUsed: [
    "color.muted-foreground", "color.foreground", "color.ring",
    "radius.sm",
    "font-family.body", "font-weight.medium",
    "font-size.sm",
    "space.2",
    "duration.fast",
  ],
};
