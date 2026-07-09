// Motion producer — read each element's CSS @keyframes animation and stash it on
// the element BEFORE the converter kills animations (extract.ts). build-frame.ts
// then attaches it as FigmaExportNode.motion, and the consumer (executor-frame
// createFigmaNode → applyMotionTracks) materializes it as Figma Motion.
//
// Scope: CSS @keyframes animations (autoplay / reveal). Hover/transition STATES
// are the separate 4a variants+reactions path (executor-components), not here.

export interface MotionStep { offset: number; style: { opacity?: string; transform?: string } }
export interface MotionSpec { steps: MotionStep[]; durationSec: number; easing?: string }

/** "0%"→0, "50%"→0.5, "100%"→1, "from"→0, "to"→1; comma list → first; clamp 0..1. */
export function parseKeyframeOffset(keyText: string): number {
  const first = (keyText || '').split(',')[0]!.trim().toLowerCase();
  let n: number;
  if (first === 'from') n = 0;
  else if (first === 'to') n = 1;
  else n = parseFloat(first) / 100; // "50%" → 0.5
  if (!Number.isFinite(n)) n = 0;
  return Math.max(0, Math.min(1, n));
}

/** "0.6s"→0.6, "600ms"→0.6, "" / "0s"→0. First value when comma-separated. */
export function parseAnimDurationSec(s: string): number {
  const first = (s || '').split(',')[0]!.trim().toLowerCase();
  if (!first) return 0;
  const v = parseFloat(first);
  if (!Number.isFinite(v)) return 0;
  return first.endsWith('ms') ? v / 1000 : v; // bare number or "0.6s" → seconds
}

/** Sort by offset, drop value-less steps; need ≥2 steps + duration>0, else undefined. */
export function buildMotionSpec(steps: MotionStep[], durationSec: number, easing?: string): MotionSpec | undefined {
  const clean = (steps || [])
    .filter((s) => s && s.style && (s.style.opacity !== undefined || s.style.transform !== undefined))
    .slice()
    .sort((a, b) => a.offset - b.offset);
  if (clean.length < 2 || !(durationSec > 0)) return undefined;
  const spec: MotionSpec = { steps: clean, durationSec };
  if (easing && easing !== 'none') spec.easing = easing.split(',')[0]!.trim();
  return spec;
}

interface KeyframeRuleLike { keyText: string; style: { opacity?: string; transform?: string } }
interface KeyframesRuleLike { type?: number; name?: string; cssRules?: ArrayLike<KeyframeRuleLike> }
interface SheetLike { cssRules?: ArrayLike<unknown> }

/** Find the @keyframes rule named `name` across style sheets → its steps. CORS-safe. */
export function resolveKeyframeSteps(name: string, sheets: ArrayLike<SheetLike>): MotionStep[] {
  const CSS_KEYFRAMES_RULE = 7; // CSSRule.KEYFRAMES_RULE
  for (let i = 0; i < sheets.length; i++) {
    let rules: ArrayLike<unknown> | undefined;
    try { rules = sheets[i]!.cssRules; } catch { continue; } // cross-origin sheet throws
    if (!rules) continue;
    for (let j = 0; j < rules.length; j++) {
      const r = rules[j] as KeyframesRuleLike;
      const isKeyframes = r.type === CSS_KEYFRAMES_RULE || (r.name !== undefined && r.cssRules !== undefined);
      if (!isKeyframes || r.name !== name || !r.cssRules) continue;
      const steps: MotionStep[] = [];
      for (let k = 0; k < r.cssRules.length; k++) {
        const kf = r.cssRules[k]!;
        steps.push({
          offset: parseKeyframeOffset(kf.keyText),
          style: { opacity: kf.style.opacity || undefined, transform: kf.style.transform || undefined },
        });
      }
      return steps;
    }
  }
  return [];
}

/**
 * DOM pass — stash `data-fa-motion` on every element carrying a CSS @keyframes
 * animation. MUST run BEFORE extract.ts kills animations. Returns the count stashed.
 * Never throws (per-element try/catch) so conversion is unaffected on any failure.
 */
export function captureMotionOntoElements(doc: Document, win: Window): number {
  let count = 0;
  const els = doc.querySelectorAll('*');
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLElement;
    try {
      const cs = win.getComputedStyle(el);
      const name = cs.animationName;
      if (!name || name === 'none') continue;
      const firstName = name.split(',')[0]!.trim();
      const steps = resolveKeyframeSteps(firstName, doc.styleSheets);
      const motion = buildMotionSpec(steps, parseAnimDurationSec(cs.animationDuration), cs.animationTimingFunction);
      if (motion) { el.setAttribute('data-fa-motion', JSON.stringify(motion)); count++; }
    } catch { /* never throw during motion capture */ }
  }
  return count;
}
