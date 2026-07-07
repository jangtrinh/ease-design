// Ported from EaseUI app/src/lib/color-utils.ts — ONLY the pure color helpers
// and static Tailwind constants the converter needs (no app/project deps).
// FigmaColor (r,g,b,a all 0..1) matches shared/figma-payload-types.ts.

import type { FigmaColor } from '../../../../shared/figma-payload-types';

export const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  gray: '#808080', grey: '#808080', transparent: 'transparent',
};

/**
 * Parse any CSS color string into a FigmaColor (0-1 range).
 * Supports: #hex (3/4/6/8), rgb(), rgba(), named colors.
 */
export function parseCssColor(color: string): FigmaColor | null {
  if (!color || color === 'transparent' || color === 'initial' || color === 'inherit') return null;
  const c = color.trim().toLowerCase();

  // Named color
  if (NAMED_COLORS[c] && c !== 'transparent') {
    return parseCssColor(NAMED_COLORS[c]);
  }

  // #hex
  const hexMatch = c.match(/^#([a-f0-9]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // rgb() / rgba()
  const rgbMatch = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]) / 255,
      g: parseFloat(rgbMatch[2]) / 255,
      b: parseFloat(rgbMatch[3]) / 255,
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return null;
}

/** Convert FigmaColor (0-1 range) to hex string. Alias: figmaColorToHex. */
export function rgbaToHex(c: FigmaColor): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Tailwind static maps (shim for token naming / future class hints) ──────

export const TW_COLORS: Record<string, string> = {
  'white': '#ffffff', 'black': '#000000',
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155',
  'slate-800': '#1e293b', 'slate-900': '#0f172a', 'slate-950': '#020617',
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db',
  'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563', 'gray-700': '#374151',
  'gray-800': '#1f2937', 'gray-900': '#111827', 'gray-950': '#030712',
  'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8',
  'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-600': '#52525b', 'zinc-700': '#3f3f46',
  'zinc-800': '#27272a', 'zinc-900': '#18181b', 'zinc-950': '#09090b',
  'neutral-50': '#fafafa', 'neutral-100': '#f5f5f5', 'neutral-200': '#e5e5e5', 'neutral-300': '#d4d4d4',
  'neutral-400': '#a3a3a3', 'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040',
  'neutral-800': '#262626', 'neutral-900': '#171717', 'neutral-950': '#0a0a0a',
  'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca', 'red-300': '#fca5a5',
  'red-400': '#f87171', 'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c',
  'red-800': '#991b1b', 'red-900': '#7f1d1d', 'red-950': '#450a0a',
  'orange-50': '#fff7ed', 'orange-500': '#f97316', 'orange-600': '#ea580c',
  'amber-50': '#fffbeb', 'amber-500': '#f59e0b', 'amber-600': '#d97706',
  'yellow-50': '#fefce8', 'yellow-500': '#eab308', 'yellow-600': '#ca8a04',
  'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0', 'green-300': '#86efac',
  'green-400': '#4ade80', 'green-500': '#22c55e', 'green-600': '#16a34a', 'green-700': '#15803d',
  'green-800': '#166534', 'green-900': '#14532d',
  'emerald-500': '#10b981', 'emerald-600': '#059669',
  'teal-500': '#14b8a6', 'teal-600': '#0d9488',
  'cyan-500': '#06b6d4', 'cyan-600': '#0891b2',
  'sky-500': '#0ea5e9', 'sky-600': '#0284c7',
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe', 'blue-300': '#93c5fd',
  'blue-400': '#60a5fa', 'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8',
  'blue-800': '#1e40af', 'blue-900': '#1e3a8a',
  'indigo-50': '#eef2ff', 'indigo-500': '#6366f1', 'indigo-600': '#4f46e5',
  'violet-50': '#f5f3ff', 'violet-500': '#8b5cf6', 'violet-600': '#7c3aed',
  'purple-50': '#faf5ff', 'purple-500': '#a855f7', 'purple-600': '#9333ea',
  'fuchsia-500': '#d946ef', 'pink-500': '#ec4899', 'pink-600': '#db2777',
  'rose-500': '#f43f5e', 'rose-600': '#e11d48',
};

export const TW_SPACING: Record<string, number> = {
  '0': 0, 'px': 1, '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10,
  '3': 12, '3.5': 14, '4': 16, '5': 20, '6': 24, '7': 28, '8': 32,
  '9': 36, '10': 40, '11': 44, '12': 48, '14': 56, '16': 64,
  '20': 80, '24': 96, '28': 112, '32': 128, '36': 144, '40': 160,
  '44': 176, '48': 192, '52': 208, '56': 224, '60': 240, '64': 256,
  '72': 288, '80': 320, '96': 384,
};

export const TW_FONT_SIZE: Record<string, number> = {
  'xs': 12, 'sm': 14, 'base': 16, 'lg': 18, 'xl': 20,
  '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60,
  '7xl': 72, '8xl': 96, '9xl': 128,
};

export const TW_FONT_WEIGHT: Record<string, number> = {
  'thin': 100, 'extralight': 200, 'light': 300, 'normal': 400,
  'medium': 500, 'semibold': 600, 'bold': 700, 'extrabold': 800, 'black': 900,
};

export const TW_BORDER_RADIUS: Record<string, number> = {
  'none': 0, 'sm': 2, '': 4, 'md': 6, 'lg': 8, 'xl': 12,
  '2xl': 16, '3xl': 24, 'full': 9999,
};
