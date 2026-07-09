// Commit 4b — Animation CONTENT → real Figma Motion tracks.
// Maps behavior.json keyframes (opacity + transform) onto Figma Motion via
// node.applyManualKeyframeTrack(field, track) + node.setTimelineDuration.
// FEATURE-GATED on the Motion API ('metronome'): probe once; on absence fall
// back to Smart-Animate variants (4a) and warn — never retry.
//
// The PURE builders (mapCssEasingToMotion, parseTransform, buildMotionTracks)
// are unit-tested WITHOUT a live canvas. The node-touching applyMotionTracks is
// LIVE-E2E PENDING (see below).
//
// LIVE-E2E PENDING (needs plugin reopened + export-video, not get_screenshot):
//   - metronome probe returns true on a Motion-capable Figma, false otherwise
//   - on unsupported Figma the one-time warning fires and 4a runs instead
//   - authored tracks actually play (verify via export-video frame sampling)
//   - reaction↔timeline seam: whether ON_HOVER can trigger a Motion timeline
import { pushImportWarning } from './executor-styles';

// ── Pure builders ────────────────────────────────────────────────────────

/** CSS timing-function → Figma MotionEasing. cubic-bezier(...) → CUSTOM. */
export function mapCssEasingToMotion(css?: string): MotionEasing {
  const c = (css || '').trim().toLowerCase();
  const bez = c.match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (bez) {
    return {
      type: 'CUSTOM_CUBIC_BEZIER',
      easingFunctionCubicBezier: {
        x1: parseFloat(bez[1]!), y1: parseFloat(bez[2]!), x2: parseFloat(bez[3]!), y2: parseFloat(bez[4]!),
      },
    };
  }
  switch (c) {
    case 'linear': return { type: 'LINEAR' };
    case 'ease-in': return { type: 'EASE_IN' };
    case 'ease-out': return { type: 'EASE_OUT' };
    case 'ease-in-out': return { type: 'EASE_IN_AND_OUT' };
    case 'ease': default: return { type: 'EASE_IN_AND_OUT' };
  }
}

export interface ParsedTransform {
  translateX?: number; translateY?: number; rotate?: number; scaleX?: number; scaleY?: number;
}

/** Parse a CSS transform string into the fields Figma Motion can animate. */
export function parseTransform(transform?: string): ParsedTransform {
  const out: ParsedTransform = {};
  const t = (transform || '').trim();
  if (!t || t === 'none') return out;
  const num = (v: string): number => parseFloat(v);
  let m: RegExpMatchArray | null;
  if ((m = t.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/))) { out.translateX = num(m[1]!); out.translateY = num(m[2]!); }
  if ((m = t.match(/translate\(\s*([-\d.]+)px\s*\)/))) out.translateX = num(m[1]!);
  if ((m = t.match(/translateX\(\s*([-\d.]+)px\s*\)/))) out.translateX = num(m[1]!);
  if ((m = t.match(/translateY\(\s*([-\d.]+)px\s*\)/))) out.translateY = num(m[1]!);
  if ((m = t.match(/rotate\(\s*([-\d.]+)deg\s*\)/))) out.rotate = num(m[1]!);
  if ((m = t.match(/scale\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/))) { out.scaleX = num(m[1]!); out.scaleY = num(m[2]!); }
  else if ((m = t.match(/scale\(\s*([-\d.]+)\s*\)/))) { out.scaleX = num(m[1]!); out.scaleY = num(m[1]!); }
  if ((m = t.match(/scaleX\(\s*([-\d.]+)\s*\)/))) out.scaleX = num(m[1]!);
  if ((m = t.match(/scaleY\(\s*([-\d.]+)\s*\)/))) out.scaleY = num(m[1]!);
  return out;
}

export interface KeyframeStyle { opacity?: string; transform?: string }
export interface KeyframeStepInput { offset: number; style: KeyframeStyle }
export interface MotionTrackSpec { field: KeyframeField; track: ManualKeyframeTrackInput }

/** Per-animatable-field value extractors (offset-style → number). */
const FIELD_EXTRACTORS: { name: KeyframePropertyFieldName; get: (s: KeyframeStyle) => number | undefined }[] = [
  { name: 'OPACITY', get: (s) => (s.opacity !== undefined && s.opacity !== '' ? parseFloat(s.opacity) : undefined) },
  { name: 'TRANSLATION_X', get: (s) => parseTransform(s.transform).translateX },
  { name: 'TRANSLATION_Y', get: (s) => parseTransform(s.transform).translateY },
  { name: 'ROTATION', get: (s) => parseTransform(s.transform).rotate },
  { name: 'SCALE_X', get: (s) => parseTransform(s.transform).scaleX },
  { name: 'SCALE_Y', get: (s) => parseTransform(s.transform).scaleY },
];

/**
 * Build Figma Motion keyframe tracks from behavior.json keyframe steps.
 * timelinePosition is in SECONDS (offset 0..1 × durationSec). A field is only
 * emitted when it appears in ≥2 steps with ≥2 distinct values (a real change).
 */
export function buildMotionTracks(
  steps: KeyframeStepInput[], durationSec: number, cssEasing?: string,
): MotionTrackSpec[] {
  if (!steps.length || durationSec <= 0) return [];
  const sorted = [...steps].sort((a, b) => a.offset - b.offset);
  const easing = mapCssEasingToMotion(cssEasing);
  const specs: MotionTrackSpec[] = [];

  for (const { name, get } of FIELD_EXTRACTORS) {
    const points: { offset: number; value: number }[] = [];
    for (const step of sorted) {
      const v = get(step.style);
      if (v !== undefined && !Number.isNaN(v)) points.push({ offset: step.offset, value: v });
    }
    if (points.length < 2) continue;
    const distinct = new Set(points.map((p) => p.value));
    if (distinct.size < 2) continue;

    const keyframes: ManualKeyframeInput[] = points.map((p) => ({
      timelinePosition: Math.round(p.offset * durationSec * 1000) / 1000,
      value: { type: 'FLOAT', value: p.value },
      easing,
    }));
    specs.push({
      field: { type: 'PROPERTY', name },
      // Omit baseValue for a NEW track — the Motion API derives it from the node
      // (per the official figma-use-motion skill; API shape validated live 2026-07-09).
      track: { keyframes },
    });
  }
  return specs;
}

// ── Feature gate + impure apply ────────────────────────────────────────────

// metronome probe result — computed ONCE per session (plan: probe once, no retry).
let motionProbe: boolean | null = null;

/** Probe whether this Figma exposes the Motion API on nodes. Cached. */
export function isMotionSupported(node: unknown): boolean {
  if (motionProbe !== null) return motionProbe;
  try {
    const n = node as { applyManualKeyframeTrack?: unknown };
    const api = (figma as unknown as { motion?: { figmaAnimationStyles?: unknown } }).motion;
    motionProbe = typeof n.applyManualKeyframeTrack === 'function' && typeof api?.figmaAnimationStyles === 'function';
  } catch {
    motionProbe = false;
  }
  return motionProbe;
}

/** Test-only: clear the cached metronome probe. */
export function resetMotionProbe(): void { motionProbe = null; }

export interface MotionApplyResult { applied: boolean; reason?: string; trackCount: number }

/**
 * Apply behavior.json keyframes to `node` as Motion tracks. Gated on the
 * metronome probe: on an unsupported Figma this returns applied=false + warns
 * once so the caller falls back to 4a (Smart-Animate variants).
 */
export function applyMotionTracks(
  node: SceneNode, steps: KeyframeStepInput[], durationSec: number, cssEasing?: string,
): MotionApplyResult {
  if (!isMotionSupported(node)) {
    pushImportWarning('Figma Motion API unavailable (metronome) — falling back to Smart-Animate variants');
    return { applied: false, reason: 'unsupported', trackCount: 0 };
  }
  const specs = buildMotionTracks(steps, durationSec, cssEasing);
  if (!specs.length) return { applied: false, reason: 'no-animatable-fields', trackCount: 0 };
  const n = node as unknown as {
    applyManualKeyframeTrack: (f: KeyframeField, t: ManualKeyframeTrackInput) => void;
    setTimelineDuration: (id: string, d: number) => void;
    timelines?: ReadonlyArray<{ id: string }>;
  };
  for (const { field, track } of specs) {
    try { n.applyManualKeyframeTrack(field, track); } catch (err) {
      pushImportWarning(`Motion track ${JSON.stringify(field)} failed: ${String(err)}`);
    }
  }
  try {
    const tl = n.timelines?.[0];
    if (tl) n.setTimelineDuration(tl.id, durationSec);
  } catch { /* timeline id unavailable in this version */ }
  return { applied: true, trackCount: specs.length };
}

// DEFERRED enhancements (documented, not v1): figma.motion.figmaAnimationStyles()
// preset reuse when a captured animation matches fade/move/scale, and
// figma.motion.physicalSpringToNormalized() for spring easings (CSS emits no
// springs today). Wire when captured springs/DS presets become available.
