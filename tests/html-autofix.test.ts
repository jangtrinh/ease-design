import { describe, expect, it } from "vitest";
import {
  fixViewportMeta,
  fixImgOnerror,
  fixLucideCreateIcons,
  fixCdnUrls,
  fixDuplicateIds,
  runAutofix,
} from "../src/core/html-autofix.js";
import { getImageFallbackScriptInline } from "../src/core/html-img-fallback-script.js";

// ─── fixViewportMeta ──────────────────────────────────────────────────────────

describe("fixViewportMeta", () => {
  it("inserts viewport meta when absent and <head> present", () => {
    const html = "<html><head><title>T</title></head><body></body></html>";
    const { html: out, applied } = fixViewportMeta(html);
    expect(applied).toBe(true);
    expect(out).toContain('<meta name="viewport"');
  });

  it("does not apply when viewport meta already present", () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head></html>';
    const { applied } = fixViewportMeta(html);
    expect(applied).toBe(false);
  });

  it("does not apply when no <head> tag", () => {
    const html = "<html><body><p>No head</p></body></html>";
    const { applied } = fixViewportMeta(html);
    expect(applied).toBe(false);
  });

  it("inserts immediately after <head> open tag", () => {
    const html = "<html><head>\n<title>T</title></head><body></body></html>";
    const { html: out } = fixViewportMeta(html);
    expect(out).toMatch(/<head>\n<meta name="viewport"/);
  });
});

// ─── fixImgOnerror ────────────────────────────────────────────────────────────

describe("fixImgOnerror", () => {
  it("adds onerror to <img> without one", () => {
    const html = '<html><body><img src="a.jpg"></body></html>';
    const { html: out, applied } = fixImgOnerror(html);
    expect(applied).toBe(true);
    expect(out).toContain("onerror=");
  });

  it("does not modify <img> that already has onerror", () => {
    const html = '<img src="a.jpg" onerror="null">';
    const { applied } = fixImgOnerror(html);
    expect(applied).toBe(false);
  });

  it("injects IIFE definition before </body> when img is modified", () => {
    // Positive test: the IIFE *definition* (window.__imgFallback=function) must
    // be present after fixing a page with an <img> but no pre-existing IIFE.
    const html = '<html><body><img src="a.jpg"></body></html>';
    const { html: out } = fixImgOnerror(html);
    expect(out).toContain("window.__imgFallback=function");
    expect(out.indexOf("window.__imgFallback=function")).toBeLessThan(out.indexOf("</body>"));
  });

  it("does not inject IIFE when the fallback definition is already present", () => {
    // The IIFE definition exists in the page — injection must be skipped.
    // Checking the count of the definition marker: must remain exactly 1.
    const iife = getImageFallbackScriptInline();
    const html = `<html><body><img src="a.jpg">${iife}</body></html>`;
    const { html: out } = fixImgOnerror(html);
    const defCount = (out.match(/window\.__imgFallback=function/g) ?? []).length;
    expect(defCount).toBe(1);
  });

  it("IIFE is injected exactly once when autofix runs twice (idempotence)", () => {
    // First pass: IIFE injected once. Second pass: IIFE definition already
    // present — guard must fire and NOT inject a second copy.
    const html = '<html><body><img src="a.jpg"></body></html>';
    const pass1 = fixImgOnerror(html).html;
    const pass2 = fixImgOnerror(pass1).html;
    const defCount = (pass2.match(/window\.__imgFallback=function/g) ?? []).length;
    expect(defCount).toBe(1);
  });

  it("is idempotent: second pass finds no imgs without onerror", () => {
    const html = '<html><body><img src="a.jpg"></body></html>';
    const pass1 = fixImgOnerror(html).html;
    const { applied } = fixImgOnerror(pass1);
    expect(applied).toBe(false);
  });
});

// ─── fixLucideCreateIcons ─────────────────────────────────────────────────────

describe("fixLucideCreateIcons", () => {
  it("inserts createIcons() when data-lucide attribute is present", () => {
    const html = '<html><body><i data-lucide="star"></i></body></html>';
    const { html: out, applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(true);
    expect(out).toContain("lucide.createIcons()");
  });

  it("inserts createIcons() when a lucide script src is present", () => {
    const html = '<html><body><script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script></body></html>';
    const { applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(true);
  });

  it("does not apply when only bare word 'lucide' appears in prose", () => {
    // Prose text containing "lucide" must not trigger the rule — no real evidence.
    const html = "<html><body><p>This design uses lucide icons conceptually.</p></body></html>";
    const { applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(false);
  });

  it("does not apply when createIcons() already present", () => {
    const html = '<html><body><i data-lucide="star"></i><script>lucide.createIcons();</script></body></html>';
    const { applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(false);
  });

  it("does not apply when no lucide usage detected", () => {
    const html = "<html><body><p>No icons here</p></body></html>";
    const { applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(false);
  });

  it("does not apply when no </body> tag", () => {
    const html = '<html><i data-lucide="star"></i></html>';
    const { applied } = fixLucideCreateIcons(html);
    expect(applied).toBe(false);
  });
});

// ─── fixCdnUrls ───────────────────────────────────────────────────────────────

describe("fixCdnUrls", () => {
  it("replaces versioned lucide CDN URL with @latest", () => {
    const html = '<script src="https://unpkg.com/lucide@0.263.1/dist/umd/lucide.min.js"></script>';
    const { html: out, applied } = fixCdnUrls(html);
    expect(applied).toBe(true);
    expect(out).toContain("lucide@latest");
    expect(out).not.toContain("lucide@0.263.1");
  });

  it("does not apply when already @latest", () => {
    const html = '<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>';
    const { applied } = fixCdnUrls(html);
    expect(applied).toBe(false);
  });

  it("does not apply when no lucide CDN URL present", () => {
    const html = "<html><body><p>No CDN</p></body></html>";
    const { applied } = fixCdnUrls(html);
    expect(applied).toBe(false);
  });
});

// ─── fixDuplicateIds ──────────────────────────────────────────────────────────

describe("fixDuplicateIds", () => {
  it("appends -1 suffix to second occurrence of duplicate id", () => {
    const html = '<div id="x">A</div><div id="x">B</div>';
    const { html: out, applied } = fixDuplicateIds(html);
    expect(applied).toBe(true);
    expect(out).toContain('id="x"');
    expect(out).toContain('id="x-1"');
  });

  it("handles three occurrences: second gets -1, third gets -2", () => {
    const html = '<div id="y"></div><div id="y"></div><div id="y"></div>';
    const { html: out } = fixDuplicateIds(html);
    expect(out).toContain('id="y"');
    expect(out).toContain('id="y-1"');
    expect(out).toContain('id="y-2"');
  });

  it("does not apply when all ids are unique", () => {
    const html = '<div id="a"></div><div id="b"></div>';
    const { applied } = fixDuplicateIds(html);
    expect(applied).toBe(false);
  });

  it("avoids creating new duplicates when -1 suffix already exists", () => {
    // x, x, x-1 → first x keeps, second x must become x-2 (not x-1 which exists)
    const html = '<div id="x"></div><div id="x"></div><div id="x-1"></div>';
    const { html: out, applied } = fixDuplicateIds(html);
    expect(applied).toBe(true);
    // The second 'x' must not become 'x-1' (already taken); it must skip to 'x-2'
    const occurrencesOfX1 = (out.match(/id="x-1"/g) ?? []).length;
    expect(occurrencesOfX1).toBe(1); // the original x-1 unchanged
    expect(out).toContain('id="x-2"');
  });

  it("is idempotent: running fixDuplicateIds twice produces no new duplicates", () => {
    const html = '<div id="x"></div><div id="x"></div>';
    const pass1 = fixDuplicateIds(html).html;
    const { applied } = fixDuplicateIds(pass1);
    expect(applied).toBe(false);
  });
});

// ─── runAutofix orchestrator ──────────────────────────────────────────────────

describe("runAutofix", () => {
  it("returns empty findings on already-clean HTML", () => {
    const html = [
      '<!doctype html>',
      '<html><head>',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<title>T</title></head>',
      '<body><p id="a">Hi</p></body></html>',
    ].join("\n");
    const { findings } = runAutofix(html);
    expect(findings).toHaveLength(0);
  });

  it("reports findings in rule order", () => {
    const html = [
      "<html><head><title>T</title></head>",
      '<body><img src="a.jpg"><i data-lucide="x"></i>',
      '<script src="https://unpkg.com/lucide@0.263.1/dist/umd/lucide.min.js"></script>',
      '<div id="dup"></div><div id="dup"></div>',
      "</body></html>",
    ].join("\n");
    const { findings } = runAutofix(html);
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("viewport-meta");
    expect(ids).toContain("img-onerror");
    expect(ids).toContain("lucide-createicons");
    expect(ids).toContain("cdn-urls");
    expect(ids).toContain("duplicate-ids");
    expect(ids.indexOf("viewport-meta")).toBeLessThan(ids.indexOf("img-onerror"));
    expect(ids.indexOf("img-onerror")).toBeLessThan(ids.indexOf("lucide-createicons"));
  });

  it("is idempotent: second pass on fixed HTML yields zero findings", () => {
    const html = [
      "<html><head><title>T</title></head>",
      '<body><img src="a.jpg"><div id="x"></div><div id="x"></div></body></html>',
    ].join("\n");
    const pass1 = runAutofix(html).html;
    const { findings } = runAutofix(pass1);
    expect(findings).toHaveLength(0);
  });

  it("injected fallback script contains no /api/unsplash/search reference", () => {
    const script = getImageFallbackScriptInline();
    expect(script).not.toContain("/api/unsplash/search");
  });
});
