// Track 5 Commit 3 pure-logic unit tests: URL → capture-folder slug resolution.
// The Playwright walk/probe functions are DOM-bound and covered by the live
// Playwright e2e (fixture + vinfastauto.com), not here.
import { describe, it, expect } from 'vitest';
import { slugifyUrl, resolveCaptureDir } from '../cli/src/capture/slug.ts';

describe('slugifyUrl', () => {
  it('kebabs the host, dropping www', () => {
    expect(slugifyUrl('https://www.vinfastauto.com')).toBe('vinfastauto-com');
    expect(slugifyUrl('https://stripe.com')).toBe('stripe-com');
  });

  it('folds the path into the slug', () => {
    expect(slugifyUrl('https://example.com/cars/vf8/')).toBe('example-com-cars-vf8');
  });

  it('accepts a bare host without scheme', () => {
    expect(slugifyUrl('linear.app')).toBe('linear-app');
  });

  it('caps length and never returns empty', () => {
    const long = `https://example.com/${'a'.repeat(200)}`;
    expect(slugifyUrl(long).length).toBeLessThanOrEqual(80);
    expect(slugifyUrl('!!!')).toBeTruthy();
  });
});

describe('resolveCaptureDir', () => {
  it('nests <slug>/capture under the base dir', () => {
    expect(resolveCaptureDir('/tmp/out', 'https://acme.io')).toBe('/tmp/out/acme-io/capture');
  });
});
