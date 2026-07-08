// Node-side behavioral orchestration: drives real page.hover()/focus() probes
// (computed-style diffs = state deltas), buckets CDP Animation.animationStarted,
// and measures carousel autoplay via an in-page MutationObserver window.
// Assembles behavior.json (schema v1). Track 5 Commit 3 (Agent2).
import type { Page, CDPSession } from 'playwright';
import type { StaticBehavior } from './behavior-static.ts';

export interface StateDelta { property: string; from: string; to: string }
export interface BehaviorElement {
  selector: string;
  sourceRule?: string;
  states: { hover?: StateDelta[]; focus?: StateDelta[] };
  transitions: { property: string; duration: number; easing: string; trigger: string }[];
  animations: { name: string; duration: number; easing: string; trigger: string }[];
  source: string;
}
export interface Carousel {
  selector: string; library: string; slideCount: number;
  autoplayMs?: number;
  slideTransition?: { property: string; duration: number; easing: string };
}
export interface Behavior {
  version: 1;
  url: string;
  capturedAt: string;
  keyframes: StaticBehavior['keyframes'];
  elements: BehaviorElement[];
  carousels: Carousel[];
  timers: { delayMs: number; kind: string; linkedSelector: string }[];
}

const DIFF_PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'borderColor', 'borderBottomColor',
  'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'filter',
];
const HOVER_CAP = 40;

/** Enable CDP Animation domain; returns a set of animation names that fired. */
export async function bucketCdpAnimations(cdp: CDPSession): Promise<Set<string>> {
  const fired = new Set<string>();
  cdp.on('Animation.animationStarted', (ev: { animation?: { name?: string; source?: { duration?: number } } }) => {
    const name = ev.animation?.name;
    if (name) fired.add(name);
  });
  try { await cdp.send('Animation.enable'); } catch { /* domain unavailable */ }
  return fired;
}

/** Compute the computed-style delta for `selector` between rest and a state. */
async function probeState(
  page: Page, selector: string, apply: 'hover' | 'focus',
): Promise<StateDelta[] | null> {
  try {
    const handle = await page.$(selector);
    if (!handle) return null;
    const before = await handle.evaluate((el, props) => {
      const cs = getComputedStyle(el as Element);
      const o: Record<string, string> = {};
      for (const p of props) o[p] = (cs as unknown as Record<string, string>)[p];
      return o;
    }, DIFF_PROPS);

    if (apply === 'hover') await handle.hover({ timeout: 1500 }).catch(() => {});
    else await handle.evaluate((el) => (el as HTMLElement).focus?.());
    await page.waitForTimeout(320);

    const after = await handle.evaluate((el, props) => {
      const cs = getComputedStyle(el as Element);
      const o: Record<string, string> = {};
      for (const p of props) o[p] = (cs as unknown as Record<string, string>)[p];
      return o;
    }, DIFF_PROPS);
    await page.mouse.move(0, 0).catch(() => {});

    const deltas: StateDelta[] = [];
    for (const p of DIFF_PROPS) {
      if (before[p] !== after[p]) deltas.push({ property: p, from: before[p]!, to: after[p]! });
    }
    return deltas.length ? deltas : null;
  } catch {
    return null;
  }
}

/** Watch a carousel root for slide changes over `windowMs`; median interval → autoplayMs. */
async function measureCarousel(page: Page, selector: string, windowMs: number): Promise<Carousel['autoplayMs'] | undefined> {
  try {
    const ms = await page.evaluate(async ({ sel, win }) => {
      const root = document.querySelector(sel);
      if (!root) return undefined;
      const stamps: number[] = [];
      const start = performance.now();
      const obs = new MutationObserver(() => stamps.push(performance.now()));
      obs.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
      await new Promise((r) => setTimeout(r, win));
      obs.disconnect();
      if (stamps.length < 2) return undefined;
      // Collapse bursts (transitions fire many mutations) into change events >250ms apart.
      const events = [start];
      for (const t of stamps) if (t - events[events.length - 1]! > 250) events.push(t);
      if (events.length < 3) return undefined;
      const gaps: number[] = [];
      for (let i = 2; i < events.length; i++) gaps.push(events[i]! - events[i - 1]!);
      gaps.sort((a, b) => a - b);
      return Math.round(gaps[Math.floor(gaps.length / 2)]!);
    }, { sel: selector, win: windowMs });
    return ms ?? undefined;
  } catch {
    return undefined;
  }
}

/** Read a carousel slide's transition property for the behavior record. */
async function slideTransition(page: Page, selector: string): Promise<Carousel['slideTransition']> {
  try {
    return await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const slide = root?.querySelector('[class*="slide"]') || root?.firstElementChild;
      if (!slide) return undefined;
      const cs = getComputedStyle(slide as Element);
      const dur = cs.transitionDuration.split(',')[0]?.trim() || '0s';
      const ms = dur.endsWith('ms') ? parseFloat(dur) : parseFloat(dur) * 1000;
      if (!ms) return undefined;
      return {
        property: cs.transitionProperty.split(',')[0]?.trim() || 'transform',
        duration: ms,
        easing: cs.transitionTimingFunction.split(',')[0]?.trim() || 'ease',
      };
    }, selector);
  } catch {
    return undefined;
  }
}

/** Assemble behavior.json: static CSSOM + CDP bucket + real hover/focus + carousels. */
export async function buildBehavior(
  page: Page, cdp: CDPSession, url: string, sb: StaticBehavior, carouselWindowMs = 6000,
): Promise<Behavior> {
  const fired = await bucketCdpAnimations(cdp);

  const elementsBySelector = new Map<string, BehaviorElement>();
  const ensure = (selector: string): BehaviorElement => {
    let e = elementsBySelector.get(selector);
    if (!e) {
      e = { selector, states: {}, transitions: [], animations: [], source: 'css' };
      elementsBySelector.set(selector, e);
    }
    return e;
  };

  // Static transitions/animations → element records.
  for (const t of sb.transitions) {
    const e = ensure(t.selector);
    for (const d of t.decls) e.transitions.push({ property: d.property, duration: d.duration, easing: d.easing, trigger: 'transition' });
  }
  for (const a of sb.animations) {
    const e = ensure(a.selector);
    for (const d of a.decls) {
      const observed = fired.has(d.name);
      e.animations.push({ name: d.name, duration: d.duration, easing: d.easing, trigger: observed ? 'observed' : 'css' });
      if (observed) e.source = 'cdp-observed';
    }
  }
  for (const r of sb.running) {
    const e = ensure(r.selector);
    e.animations.push({ name: r.name, duration: r.duration, easing: r.easing, trigger: 'waapi' });
    e.source = 'waapi';
  }

  // Real hover/focus probes (deduped by base selector, capped).
  const stateTargets = [...new Set(sb.hoverRules.map((h) => `${h.pseudo}::${h.selector}`))].slice(0, HOVER_CAP);
  for (const key of stateTargets) {
    const [pseudo, selector] = key.split('::') as ['hover' | 'focus', string];
    const deltas = await probeState(page, selector, pseudo);
    if (deltas) {
      const e = ensure(selector);
      e.states[pseudo] = deltas;
      e.sourceRule = `${selector}:${pseudo}`;
    }
  }

  // Carousels + autoplay timing.
  const carousels: Carousel[] = [];
  const timers: Behavior['timers'] = [];
  for (const c of sb.carousels.slice(0, 3)) {
    const autoplayMs = await measureCarousel(page, c.selector, carouselWindowMs);
    const st = await slideTransition(page, c.selector);
    carousels.push({ selector: c.selector, library: c.library, slideCount: c.slideCount, autoplayMs, slideTransition: st });
    if (autoplayMs) timers.push({ delayMs: autoplayMs, kind: 'interval', linkedSelector: c.selector });
  }

  return {
    version: 1,
    url,
    capturedAt: new Date().toISOString(),
    keyframes: sb.keyframes,
    elements: [...elementsBySelector.values()].filter(
      (e) => e.transitions.length || e.animations.length || e.states.hover || e.states.focus,
    ).slice(0, 200),
    carousels,
    timers,
  };
}
