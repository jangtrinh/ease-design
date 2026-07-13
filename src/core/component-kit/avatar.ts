/**
 * Display/Avatar — a user glyph with the image-fallback-to-initials pattern.
 *
 * Axis: Size (Sm | Md | Lg). The initials treatment is the always-available fallback — a
 * plain text glyph on the L8 `--color-accent` pair (the soft branded tint, AA by construction).
 * The optional `<img>` (a real avatar photo) carries an `alt`; when it is absent the initials
 * show through. An avatar is a leaf display primitive — no interactive or data states — so it
 * declares `State=Static` (which normalises to no state; it does not join the specimen contract).
 */
import type { KitComponent } from "./kit-types.js";

// Self-contained placeholder photo (a solid brand-neutral circle) — a stand-in for a loaded
// avatar image, URL-encoded and hex-free so the fragment stays offline and token-clean.
const PHOTO =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='72'%20height='72'%3E%3Ccircle%20cx='36'%20cy='36'%20r='36'%20fill='steelblue'/%3E%3Ccircle%20cx='36'%20cy='29'%20r='13'%20fill='aliceblue'/%3E%3Cpath%20d='M14%2066a22%2018%200%200%201%2044%200z'%20fill='aliceblue'/%3E%3C/svg%3E";

const markup = `<div class="ui-kit ui-avatar">
  <style>
    .ui-avatar { display: grid; gap: var(--space-4); font-family: var(--font-family-body); }
    .ui-avatar__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .ui-avatar__cap { min-width: 84px; font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-avatar__face {
      display: inline-flex; align-items: center; justify-content: center; flex: none; overflow: hidden;
      border-radius: var(--radius-full); border: 1px solid var(--color-border);
      background: var(--color-accent); color: var(--color-accent-foreground); font-weight: var(--font-weight-semibold);
    }
    .ui-avatar__face--sm { width: 1.75rem; height: 1.75rem; font-size: var(--font-size-xs); }
    .ui-avatar__face--md { width: 2.25rem; height: 2.25rem; font-size: var(--font-size-sm); }
    .ui-avatar__face--lg { width: 3rem;    height: 3rem;    font-size: var(--font-size-md); }
    .ui-avatar__img { width: 100%; height: 100%; object-fit: cover; }
  </style>
  <div class="ui-avatar__row">
    <span class="ui-avatar__cap">Sizes</span>
    <span class="ui-avatar__face ui-avatar__face--sm">AL</span>
    <span class="ui-avatar__face ui-avatar__face--md">AL</span>
    <span class="ui-avatar__face ui-avatar__face--lg">AL</span>
  </div>
  <div class="ui-avatar__row">
    <span class="ui-avatar__cap">Fallback</span>
    <span class="ui-avatar__face ui-avatar__face--lg"><img class="ui-avatar__img" src="${PHOTO}" alt="Grace Hopper"></span>
    <span class="ui-avatar__face ui-avatar__face--lg">GH</span>
  </div>
</div>`;

export const avatar: KitComponent = {
  name: "Display/Avatar",
  category: "display",
  markup,
  description: "User avatar — three sizes with the image-fallback-to-initials pattern on the accent tint.",
  status: "stable",
  variants: [
    "Size=Sm", "Size=Md", "Size=Lg",
    "State=Static",
  ],
  tokensUsed: [
    "color.accent", "color.accent-foreground", "color.border", "color.muted-foreground",
    "radius.full",
    "font-family.body", "font-weight.semibold",
    "font-size.xs", "font-size.sm", "font-size.md",
    "space.3", "space.4",
  ],
};
