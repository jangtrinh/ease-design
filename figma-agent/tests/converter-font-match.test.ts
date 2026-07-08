// Track 5 Commit 2 pure-logic unit tests: CSS font-stack normalize + match
// against Figma's available-font registry (COPY #9). No live canvas required.
//
// LIVE-E2E PENDING (Commit 2, needs plugin reopened in Figma Desktop):
//   - a brand font present in Figma resolves via the registry match (not Inter)
//   - a missing primary + present fallback in the stack resolves to the fallback
//   - the listAvailableFontsAsync registry is fetched once and cached per session
import { describe, it, expect } from 'vitest';
import {
  normalizeFamily, parseFontStack, matchFamily, matchFamilyStack, pickStyle,
} from '../plugin/src/main/font-match.ts';

describe('normalizeFamily', () => {
  it('lowercases, strips quotes, collapses whitespace', () => {
    expect(normalizeFamily('"Helvetica  Neue"')).toBe('helvetica neue');
    expect(normalizeFamily("  'Roboto' ")).toBe('roboto');
  });
});

describe('parseFontStack', () => {
  it('splits a stack and drops generic keywords', () => {
    expect(parseFontStack('"Helvetica Neue", Arial, sans-serif')).toEqual(['Helvetica Neue', 'Arial']);
    expect(parseFontStack('-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto'))
      .toEqual(['Segoe UI', 'Roboto']);
  });

  it('returns [] for empty / all-generic stacks', () => {
    expect(parseFontStack('')).toEqual([]);
    expect(parseFontStack('serif, monospace')).toEqual([]);
  });
});

describe('matchFamily', () => {
  const available = ['Inter', 'Roboto', 'Helvetica Neue', 'SF Pro Text'];

  it('matches case-insensitively / ignoring quotes', () => {
    expect(matchFamily('roboto', available)).toBe('Roboto');
    expect(matchFamily('"Inter"', available)).toBe('Inter');
  });

  it('matches on word-boundary prefix both directions', () => {
    // requested "Helvetica" resolves to installed "Helvetica Neue"
    expect(matchFamily('Helvetica', available)).toBe('Helvetica Neue');
    // requested "SF Pro Text Bold-ish" won't; but "SF Pro Text" exact does
    expect(matchFamily('SF Pro Text', available)).toBe('SF Pro Text');
  });

  it('does not match unrelated families', () => {
    expect(matchFamily('Comic Sans', available)).toBeNull();
    expect(matchFamily('Robotica', available)).toBeNull(); // not a word-prefix of Roboto
  });
});

describe('matchFamilyStack', () => {
  const available = ['Inter', 'Arial'];

  it('returns the first family in the stack that is installed', () => {
    expect(matchFamilyStack(['Helvetica Neue', 'Arial'], available)).toBe('Arial');
  });

  it('returns null when none of the stack is installed', () => {
    expect(matchFamilyStack(['Futura', 'Gotham'], available)).toBeNull();
  });
});

describe('pickStyle', () => {
  const styles = ['Regular', 'Medium', 'SemiBold', 'Bold', 'Bold Italic'];

  it('picks the style matching a weight variant (space-insensitive)', () => {
    expect(pickStyle(['SemiBold', 'Semi Bold', 'Semibold'], styles)).toBe('SemiBold');
    expect(pickStyle(['Bold'], styles)).toBe('Bold');
  });

  it('returns null when no variant is available', () => {
    expect(pickStyle(['Thin', 'Hairline'], styles)).toBeNull();
  });
});
