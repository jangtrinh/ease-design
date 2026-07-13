/**
 * Display/Progress — a determinate + indeterminate progress bar.
 *
 * State axis: Default (a value-bearing bar, `aria-valuenow` set) | Indeterminate (no known
 * value, an animated sweep). The track is `--color-muted`, the fill `--color-primary`. Each
 * track carries `role="progressbar"` with `aria-valuemin`/`aria-valuemax` (and `aria-valuenow`
 * only when determinate — omitting it is the correct ARIA signal for indeterminate). The
 * indeterminate sweep animates TRANSFORM only (never a layout property) and guards itself with a
 * `@media (prefers-reduced-motion: reduce)` fallback to a static full-width bar.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-progress">
  <style>
    .ui-progress { display: grid; gap: var(--space-4); font-family: var(--font-family-body); max-width: 360px; }
    .ui-progress__row { display: grid; gap: var(--space-2); }
    .ui-progress__cap { display: flex; justify-content: space-between; font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-progress__track {
      position: relative; overflow: hidden; height: 0.5rem;
      background: var(--color-muted); border-radius: var(--radius-full);
    }
    .ui-progress__fill { height: 100%; border-radius: var(--radius-full); background: var(--color-primary); }
    .ui-progress__fill--v30 { width: 30%; }
    .ui-progress__fill--v72 { width: 72%; }
    .ui-progress__fill--indet { position: absolute; top: 0; left: 0; width: 40%; animation: ui-progress-slide var(--duration-slow) ease-in-out infinite; }
    @keyframes ui-progress-slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(275%); } }
    /* Motion floor: an indeterminate sweep must resolve to a static bar for reduced-motion users. */
    @media (prefers-reduced-motion: reduce) {
      .ui-progress__fill--indet { animation: none; transform: none; width: 100%; }
    }
  </style>
  <div class="ui-progress__row">
    <div class="ui-progress__cap"><span>Uploading assets</span><span>30%</span></div>
    <div class="ui-progress__track" role="progressbar" aria-label="Uploading assets" aria-valuenow="30" aria-valuemin="0" aria-valuemax="100">
      <div class="ui-progress__fill ui-progress__fill--v30"></div>
    </div>
  </div>
  <div class="ui-progress__row">
    <div class="ui-progress__cap"><span>Compiling tokens</span><span>72%</span></div>
    <div class="ui-progress__track" role="progressbar" aria-label="Compiling tokens" aria-valuenow="72" aria-valuemin="0" aria-valuemax="100">
      <div class="ui-progress__fill ui-progress__fill--v72"></div>
    </div>
  </div>
  <div class="ui-progress__row">
    <div class="ui-progress__cap"><span>Publishing release</span><span>Working…</span></div>
    <div class="ui-progress__track" role="progressbar" aria-label="Publishing release, in progress">
      <div class="ui-progress__fill ui-progress__fill--indet"></div>
    </div>
  </div>
</div>`;

export const progress: KitComponent = {
  name: "Display/Progress",
  category: "feedback",
  markup,
  description: "Progress bar — determinate value rows plus a reduced-motion-guarded indeterminate sweep, each a progressbar role.",
  status: "stable",
  variants: [
    "State=Default", "State=Indeterminate",
  ],
  tokensUsed: [
    "color.muted", "color.primary", "color.muted-foreground",
    "radius.full",
    "font-family.body", "font-size.xs",
    "space.2", "space.4",
    "duration.slow",
  ],
};
