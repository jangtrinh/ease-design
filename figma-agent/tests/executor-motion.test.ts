// Track 5 Commit 4b pure-builder unit tests: behavior.json keyframes →
// applyManualKeyframeTrack payloads + the metronome feature gate.
// No live canvas. Track playback is LIVE-E2E PENDING (executor-motion.ts header).
import { describe, it, expect, afterEach } from 'vitest';
import {
  mapCssEasingToMotion, parseTransform, buildMotionTracks,
  isMotionSupported, resetMotionProbe,
} from '../plugin/src/main/executor-motion.ts';

describe('mapCssEasingToMotion', () => {
  it('maps keyword timing functions', () => {
    expect(mapCssEasingToMotion('linear')).toEqual({ type: 'LINEAR' });
    expect(mapCssEasingToMotion('ease-out')).toEqual({ type: 'EASE_OUT' });
    expect(mapCssEasingToMotion('ease-in-out')).toEqual({ type: 'EASE_IN_AND_OUT' });
    expect(mapCssEasingToMotion(undefined)).toEqual({ type: 'EASE_IN_AND_OUT' });
  });

  it('maps cubic-bezier(...) to CUSTOM_CUBIC_BEZIER', () => {
    const e = mapCssEasingToMotion('cubic-bezier(.16, 1, .3, 1)');
    expect(e.type).toBe('CUSTOM_CUBIC_BEZIER');
    expect(e.easingFunctionCubicBezier).toEqual({ x1: 0.16, y1: 1, x2: 0.3, y2: 1 });
  });
});

describe('parseTransform', () => {
  it('extracts translate / rotate / scale fields', () => {
    expect(parseTransform('translateY(24px)')).toEqual({ translateY: 24 });
    expect(parseTransform('translate(10px, -5px)')).toEqual({ translateX: 10, translateY: -5 });
    expect(parseTransform('rotate(45deg)')).toEqual({ rotate: 45 });
    expect(parseTransform('scale(1.05)')).toEqual({ scaleX: 1.05, scaleY: 1.05 });
    expect(parseTransform('none')).toEqual({});
  });
});

describe('buildMotionTracks', () => {
  const fadeUp = [
    { offset: 0, style: { opacity: '0', transform: 'translateY(24px)' } },
    { offset: 1, style: { opacity: '1', transform: 'translateY(0px)' } },
  ];

  it('emits OPACITY + TRANSLATION_Y tracks with seconds-based positions', () => {
    const specs = buildMotionTracks(fadeUp, 0.6, 'cubic-bezier(.16,1,.3,1)');
    const byName = new Map(specs.map((s) => [s.field.type === 'PROPERTY' ? s.field.name : '', s]));
    expect([...byName.keys()].sort()).toEqual(['OPACITY', 'TRANSLATION_Y']);

    const op = byName.get('OPACITY')!;
    expect(op.field).toEqual({ type: 'PROPERTY', name: 'OPACITY' });
    expect(op.track.baseValue).toBeUndefined(); // omitted for new tracks — API derives it
    expect(op.track.keyframes.map((k) => k.timelinePosition)).toEqual([0, 0.6]);
    expect(op.track.keyframes.map((k) => k.value)).toEqual([{ type: 'FLOAT', value: 0 }, { type: 'FLOAT', value: 1 }]);
    expect(op.track.keyframes[0]!.easing).toEqual({
      type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
    });

    const ty = byName.get('TRANSLATION_Y')!;
    expect(ty.track.keyframes.map((k) => (k.value as { value: number }).value)).toEqual([24, 0]);
  });

  it('skips fields that do not change or appear once, and empty/zero-duration input', () => {
    const noChange = [
      { offset: 0, style: { opacity: '1' } },
      { offset: 1, style: { opacity: '1' } },
    ];
    expect(buildMotionTracks(noChange, 0.5)).toEqual([]);
    expect(buildMotionTracks(fadeUp, 0)).toEqual([]);
    expect(buildMotionTracks([], 0.5)).toEqual([]);
  });
});

describe('isMotionSupported (metronome gate)', () => {
  afterEach(() => {
    resetMotionProbe();
    delete (globalThis as { figma?: unknown }).figma;
  });

  it('returns false when the Motion API is absent (and caches)', () => {
    (globalThis as { figma?: unknown }).figma = {};
    expect(isMotionSupported({})).toBe(false);
    // cached: even a capable node now returns the cached false
    expect(isMotionSupported({ applyManualKeyframeTrack: () => {} })).toBe(false);
  });

  it('returns true when node + figma.motion expose the Motion API', () => {
    (globalThis as { figma?: unknown }).figma = { motion: { figmaAnimationStyles: () => [] } };
    expect(isMotionSupported({ applyManualKeyframeTrack: () => {} })).toBe(true);
  });
});
