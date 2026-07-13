/**
 * Display/Skeleton — the pre-load placeholder shimmer.
 *
 * Axis: Shape (Line | Circle | Block). Each placeholder is a `--color-muted` surface that
 * pulses via the `ui-skel-pulse` keyframes — an OPACITY-only animation (never a layout
 * property), and one this fragment guards itself: the `@media (prefers-reduced-motion: reduce)`
 * block stops it for motion-sensitive users (the hard-won kit rule — every animation ships its
 * own floor). The whole placeholder is `aria-hidden` (it conveys no content). It models the
 * loading moment, so it declares `State=Loading`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-skel" aria-hidden="true">
  <style>
    .ui-skel { display: grid; gap: var(--space-4); max-width: 320px; }
    .ui-skel__card { display: grid; grid-template-columns: auto 1fr; gap: var(--space-3); align-items: center; }
    .ui-skel__circle, .ui-skel__bar, .ui-skel__block {
      background: var(--color-muted);
      animation: ui-skel-pulse var(--duration-slow) ease-in-out infinite;
    }
    .ui-skel__circle { width: 2.5rem; height: 2.5rem; border-radius: var(--radius-full); flex: none; }
    .ui-skel__lines { display: grid; gap: var(--space-2); }
    .ui-skel__bar { height: 0.6rem; border-radius: var(--radius-sm); }
    .ui-skel__bar--short { width: 60%; }
    .ui-skel__block { height: var(--space-16); border-radius: var(--radius-card); }
    @keyframes ui-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    /* Motion floor: the shimmer is decorative — it must stop for reduced-motion users. */
    @media (prefers-reduced-motion: reduce) {
      .ui-skel__circle, .ui-skel__bar, .ui-skel__block { animation: none; }
    }
  </style>
  <div class="ui-skel__card">
    <div class="ui-skel__circle"></div>
    <div class="ui-skel__lines">
      <div class="ui-skel__bar"></div>
      <div class="ui-skel__bar ui-skel__bar--short"></div>
    </div>
  </div>
  <div class="ui-skel__block"></div>
</div>`;

export const skeleton: KitComponent = {
  name: "Display/Skeleton",
  category: "feedback",
  markup,
  description: "Loading skeleton — line, circle, and block placeholders that pulse, with a self-contained reduced-motion guard.",
  status: "stable",
  variants: [
    "Shape=Line", "Shape=Circle", "Shape=Block",
    "State=Loading",
  ],
  tokensUsed: [
    "color.muted",
    "radius.full", "radius.sm", "radius.card",
    "space.2", "space.3", "space.4", "space.16",
    "duration.slow",
  ],
};
