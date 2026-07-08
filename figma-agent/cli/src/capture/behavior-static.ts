// Static behavioral extraction — runs INSIDE the page via page.evaluate
// (serialized by source; keep self-contained). Reads the CSSOM for @keyframes,
// transition/animation declarations, and :hover/:focus rules (the
// storybook-pseudo-states trick), plus a getAnimations({subtree}) sweep of live
// WAAPI animations, and fingerprints carousel roots. Track 5 Commit 3 (Agent2).

export interface KeyframeStep { offset: number; style: Record<string, string> }
export interface TransitionDecl {
  property: string; duration: number; easing: string; delay: number;
}
export interface AnimationDecl {
  name: string; duration: number; easing: string; iterations: string;
}
export interface HoverRule {
  selector: string;      // base selector with the :hover/:focus suffix stripped
  pseudo: 'hover' | 'focus';
  props: Record<string, string>;  // declared property → value in the state rule
}
export interface CarouselCandidate { selector: string; library: string; slideCount: number }
export interface RunningAnimation { selector: string; name: string; duration: number; easing: string }

export interface StaticBehavior {
  keyframes: Record<string, KeyframeStep[]>;
  transitions: { selector: string; decls: TransitionDecl[] }[];
  animations: { selector: string; decls: AnimationDecl[] }[];
  hoverRules: HoverRule[];
  carousels: CarouselCandidate[];
  running: RunningAnimation[];
}

/** Runs in the browser. Pure CSSOM + getAnimations read (no state mutation). */
export function inPageBehaviorStatic(): StaticBehavior {
  const cssPath = (el: Element): string => {
    if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let sel = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
      if (cls) sel += `.${CSS.escape(cls)}`;
      parts.unshift(sel);
      if ((node as HTMLElement).id) { parts[0] = `#${(node as HTMLElement).id}`; break; }
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  };

  const keyframes: Record<string, KeyframeStep[]> = {};
  const hoverRules: HoverRule[] = [];

  const walkRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const type = (rule as CSSRule).type;
      if (type === 7) {
        // CSSKeyframesRule
        const kf = rule as CSSKeyframesRule;
        const steps: KeyframeStep[] = [];
        for (const k of Array.from(kf.cssRules)) {
          const kr = k as CSSKeyframeRule;
          const offsets = kr.keyText.split(',').map((s) => {
            const t = s.trim();
            if (t === 'from') return 0;
            if (t === 'to') return 1;
            return (parseFloat(t) || 0) / 100;
          });
          const style: Record<string, string> = {};
          for (let i = 0; i < kr.style.length; i++) {
            const prop = kr.style[i];
            style[prop] = kr.style.getPropertyValue(prop);
          }
          for (const offset of offsets) steps.push({ offset, style });
        }
        keyframes[kf.name] = steps.sort((a, b) => a.offset - b.offset);
      } else if (type === 1) {
        // CSSStyleRule — capture :hover / :focus state rules.
        const sr = rule as CSSStyleRule;
        const sel = sr.selectorText || '';
        for (const pseudo of ['hover', 'focus'] as const) {
          if (sel.indexOf(`:${pseudo}`) < 0) continue;
          const base = sel.replace(new RegExp(`:${pseudo}\\b`, 'g'), '').trim();
          const props: Record<string, string> = {};
          for (let i = 0; i < sr.style.length; i++) {
            const p = sr.style[i];
            props[p] = sr.style.getPropertyValue(p);
          }
          if (base && Object.keys(props).length) hoverRules.push({ selector: base, pseudo, props });
        }
      } else if (type === 4 || type === 12) {
        // CSSMediaRule / CSSSupportsRule — recurse.
        walkRules((rule as CSSMediaRule).cssRules);
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try { rules = sheet.cssRules; } catch { continue; }
    if (rules) walkRules(rules);
  }

  // Per-element transition / animation declarations (sampled: elements that
  // actually declare a transition or a named animation).
  const transitions: StaticBehavior['transitions'] = [];
  const animations: StaticBehavior['animations'] = [];
  const parseMs = (v: string): number => {
    const t = v.trim();
    if (t.endsWith('ms')) return parseFloat(t);
    if (t.endsWith('s')) return parseFloat(t) * 1000;
    return parseFloat(t) || 0;
  };
  const sampled = Array.from(document.querySelectorAll('*')).slice(0, 4000);
  for (const el of sampled) {
    const cs = getComputedStyle(el);
    const tProp = cs.transitionProperty;
    if (tProp && tProp !== 'none' && tProp !== 'all 0s ease 0s') {
      const props = tProp.split(',').map((s) => s.trim());
      const durs = cs.transitionDuration.split(',').map((s) => s.trim());
      const eases = cs.transitionTimingFunction.split(',').map((s) => s.trim());
      const delays = cs.transitionDelay.split(',').map((s) => s.trim());
      const decls: TransitionDecl[] = props
        .map((property, i) => ({
          property,
          duration: parseMs(durs[i % durs.length] || '0s'),
          easing: eases[i % eases.length] || 'ease',
          delay: parseMs(delays[i % delays.length] || '0s'),
        }))
        .filter((d) => d.duration > 0);
      if (decls.length) transitions.push({ selector: cssPath(el), decls });
    }
    const aName = cs.animationName;
    if (aName && aName !== 'none') {
      const names = aName.split(',').map((s) => s.trim());
      const durs = cs.animationDuration.split(',').map((s) => s.trim());
      const eases = cs.animationTimingFunction.split(',').map((s) => s.trim());
      const iters = cs.animationIterationCount.split(',').map((s) => s.trim());
      const decls: AnimationDecl[] = names.map((name, i) => ({
        name,
        duration: parseMs(durs[i % durs.length] || '0s'),
        easing: eases[i % eases.length] || 'ease',
        iterations: iters[i % iters.length] || '1',
      }));
      animations.push({ selector: cssPath(el), decls });
    }
  }

  // Carousel fingerprints (library class markers).
  const carousels: CarouselCandidate[] = [];
  const libSelectors: { library: string; sel: string; slide: string }[] = [
    { library: 'swiper', sel: '.swiper', slide: '.swiper-slide' },
    { library: 'slick', sel: '.slick-slider', slide: '.slick-slide' },
    { library: 'glide', sel: '.glide', slide: '.glide__slide' },
    { library: 'splide', sel: '.splide', slide: '.splide__slide' },
    { library: 'flickity', sel: '.flickity-enabled', slide: '.carousel-cell' },
    { library: 'generic', sel: '[class*="carousel"]', slide: '[class*="slide"]' },
  ];
  const seen = new Set<Element>();
  for (const { library, sel, slide } of libSelectors) {
    for (const root of Array.from(document.querySelectorAll(sel))) {
      if (seen.has(root)) continue;
      seen.add(root);
      carousels.push({ selector: cssPath(root), library, slideCount: root.querySelectorAll(slide).length });
    }
  }

  // Live WAAPI animations (scroll-reveals, JS-driven).
  const running: RunningAnimation[] = [];
  type AnimWithEffect = Animation & { effect: KeyframeEffect | null };
  const getAnims = (document as unknown as { getAnimations?: () => Animation[] }).getAnimations;
  if (typeof getAnims === 'function') {
    for (const a of getAnims.call(document).slice(0, 200)) {
      const eff = (a as AnimWithEffect).effect;
      const target = eff && 'target' in eff ? (eff.target as Element | null) : null;
      const timing = eff ? eff.getTiming() : null;
      running.push({
        selector: target ? cssPath(target) : '(unknown)',
        name: (a as Animation & { animationName?: string }).animationName || a.id || 'anim',
        duration: timing && typeof timing.duration === 'number' ? timing.duration : 0,
        easing: timing?.easing || 'linear',
      });
    }
  }

  return { keyframes, transitions, animations, hoverRules, carousels, running };
}
