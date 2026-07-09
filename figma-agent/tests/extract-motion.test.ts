/**
 * Motion producer pure helpers (extract-motion.ts) — the DOM passes
 * (captureMotionOntoElements + the computed-walk data-fa-motion read) are
 * browser-only and covered by LIVE-E2E, not here.
 */
import { describe, expect, it } from 'vitest';
import {
  parseKeyframeOffset,
  parseAnimDurationSec,
  buildMotionSpec,
  resolveKeyframeSteps,
  type MotionStep,
} from '../plugin/src/ui/converter/extract-motion';

describe('parseKeyframeOffset', () => {
  it('maps %, from/to, comma-first, and clamps', () => {
    expect(parseKeyframeOffset('0%')).toBe(0);
    expect(parseKeyframeOffset('50%')).toBe(0.5);
    expect(parseKeyframeOffset('100%')).toBe(1);
    expect(parseKeyframeOffset('from')).toBe(0);
    expect(parseKeyframeOffset('to')).toBe(1);
    expect(parseKeyframeOffset('0%, 50%')).toBe(0); // first
    expect(parseKeyframeOffset('150%')).toBe(1); // clamped
    expect(parseKeyframeOffset('')).toBe(0);
  });
});

describe('parseAnimDurationSec', () => {
  it('parses s / ms / empty / comma-first', () => {
    expect(parseAnimDurationSec('0.6s')).toBeCloseTo(0.6);
    expect(parseAnimDurationSec('600ms')).toBeCloseTo(0.6);
    expect(parseAnimDurationSec('')).toBe(0);
    expect(parseAnimDurationSec('0s')).toBe(0);
    expect(parseAnimDurationSec('0.6s, 1s')).toBeCloseTo(0.6);
  });
});

describe('buildMotionSpec', () => {
  const steps: MotionStep[] = [
    { offset: 1, style: { opacity: '1', transform: 'none' } },
    { offset: 0, style: { opacity: '0', transform: 'translateY(20px)' } },
  ];
  it('sorts by offset and keeps easing', () => {
    const spec = buildMotionSpec(steps, 0.6, 'ease-out');
    expect(spec).toBeDefined();
    expect(spec!.steps.map((s) => s.offset)).toEqual([0, 1]);
    expect(spec!.durationSec).toBe(0.6);
    expect(spec!.easing).toBe('ease-out');
  });
  it('drops value-less steps and requires >= 2', () => {
    const withEmpty: MotionStep[] = [
      { offset: 0, style: {} },
      { offset: 1, style: { opacity: '1' } },
    ];
    expect(buildMotionSpec(withEmpty, 0.6)).toBeUndefined(); // only 1 real step
  });
  it('returns undefined for duration <= 0', () => {
    expect(buildMotionSpec(steps, 0)).toBeUndefined();
  });
  it('takes the first easing when comma-separated and drops "none"', () => {
    expect(buildMotionSpec(steps, 0.6, 'ease-out, linear')!.easing).toBe('ease-out');
    expect(buildMotionSpec(steps, 0.6, 'none')!.easing).toBeUndefined();
  });
});

describe('resolveKeyframeSteps', () => {
  const sheets = [
    {
      cssRules: [
        {
          name: 'fadeUp',
          cssRules: [
            { keyText: '0%', style: { opacity: '0', transform: 'translateY(20px)' } },
            { keyText: '100%', style: { opacity: '1', transform: 'none' } },
          ],
        },
      ],
    },
  ] as unknown as ArrayLike<{ cssRules?: ArrayLike<unknown> }>;

  it('finds the named @keyframes and extracts steps', () => {
    const steps = resolveKeyframeSteps('fadeUp', sheets);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ offset: 0, style: { opacity: '0', transform: 'translateY(20px)' } });
    expect(steps[1]!.offset).toBe(1);
  });
  it('returns [] for an unknown name', () => {
    expect(resolveKeyframeSteps('nope', sheets)).toEqual([]);
  });
  it('skips a cross-origin sheet that throws on cssRules', () => {
    const bad = [{ get cssRules(): never { throw new Error('SecurityError'); } }] as unknown as ArrayLike<{ cssRules?: ArrayLike<unknown> }>;
    expect(resolveKeyframeSteps('fadeUp', bad)).toEqual([]);
  });
});
