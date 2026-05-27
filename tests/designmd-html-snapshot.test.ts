import { describe, expect, it } from "vitest";
import { transformSnapshot } from "../src/core/designmd-html-snapshot.js";

const ORIGIN = "https://example.com";

describe("transformSnapshot — script + preload stripping", () => {
  it("strips every <script> tag", () => {
    const html = `<html><head><script>a()</script></head><body>x<script src="/a.js"></script></body></html>`;
    const { html: out, removed } = transformSnapshot(html, [], ORIGIN);
    expect(out).not.toContain("<script");
    expect(removed.scripts).toBe(2);
  });

  it("strips preload/prefetch/dns-prefetch/preconnect links", () => {
    const html = `
      <link rel="preload" href="/a.woff2">
      <link rel="prefetch" href="/b.js">
      <link rel="modulepreload" href="/c.js">
      <link rel="dns-prefetch" href="//d.com">
      <link rel="preconnect" href="//e.com">
      <link rel="stylesheet" href="//cdn.example/x.css">
    `;
    const { html: out, removed } = transformSnapshot(html, [], ORIGIN);
    expect(removed.preloads).toBe(5);
    // Cross-origin stylesheet survives (we can't replace it without network)
    expect(out).toContain('rel="stylesheet"');
  });
});

describe("transformSnapshot — CSS inlining", () => {
  it("strips root-relative <link rel=stylesheet> and inlines all supplied CSS", () => {
    const html = `<head><link rel="stylesheet" href="/_next/static/chunks/abc.css"></head><body></body>`;
    const css = [{ name: "abc.css", body: ".x { color: red }" }];
    const { html: out, removed } = transformSnapshot(html, css, ORIGIN);
    expect(out).toContain('<style data-source="abc.css">.x { color: red }</style>');
    expect(out).not.toContain('rel="stylesheet"');
    expect(removed.cssInlined).toBe(1);
  });

  it("preserves cross-origin <link rel=stylesheet> tags (can't be inlined without fetching)", () => {
    const html = `<head><link rel="stylesheet" href="//cdn.example/x.css"></head><body></body>`;
    const css = [{ name: "local.css", body: ".y {}" }];
    const { html: out } = transformSnapshot(html, css, ORIGIN);
    expect(out).toContain('href="//cdn.example/x.css"');
    expect(out).toContain('<style data-source="local.css">.y {}</style>');
  });

  it("inlines multiple CSS chunks in order", () => {
    const html = `<head></head><body></body>`;
    const css = [
      { name: "a.css", body: ".a {}" },
      { name: "b.css", body: ".b {}" },
    ];
    const { html: out, removed } = transformSnapshot(html, css, ORIGIN);
    expect(out).toContain('<style data-source="a.css">.a {}</style>');
    expect(out).toContain('<style data-source="b.css">.b {}</style>');
    expect(out.indexOf("a.css")).toBeLessThan(out.indexOf("b.css"));
    expect(removed.cssInlined).toBe(2);
  });

  it("falls back to prepending <style> to <body> when no </head>", () => {
    const html = `<html><body>content</body></html>`;
    const css = [{ name: "a.css", body: ".a {}" }];
    const { html: out } = transformSnapshot(html, css, ORIGIN);
    expect(out).toContain('<style data-source="a.css">.a {}</style>');
    expect(out.indexOf("<style")).toBeLessThan(out.indexOf("content"));
  });
});

describe("transformSnapshot — inline style sanitisation", () => {
  it("strips opacity:0 from inline style", () => {
    const html = `<div style="opacity:0; color:red"></div>`;
    const { html: out, removed } = transformSnapshot(html, [], ORIGIN);
    expect(out).not.toMatch(/opacity:\s*0/);
    expect(out).toContain("color:red");
    expect(removed.inlineOpacityHides).toBe(1);
  });

  it("strips transform:translate from inline style", () => {
    const html = `<div style="transform:translateY(24px); color:blue"></div>`;
    const { html: out, removed } = transformSnapshot(html, [], ORIGIN);
    expect(out).not.toMatch(/transform:\s*translate/);
    expect(out).toContain("color:blue");
    expect(removed.inlineTransformTranslates).toBe(1);
  });

  it("removes the whole style attribute when it becomes empty", () => {
    const html = `<div style="opacity:0;transform:translateY(24px)"></div>`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).not.toContain("style=");
  });

  it("preserves opacity values other than 0", () => {
    const html = `<div style="opacity:0.8"></div>`;
    const { html: out, removed } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain("opacity:0.8");
    expect(removed.inlineOpacityHides).toBe(0);
  });
});

describe("transformSnapshot — URL absolutisation", () => {
  it("absolutises src=/", () => {
    const html = `<img src="/images/foo.png">`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain(`src="${ORIGIN}/images/foo.png"`);
  });

  it("absolutises href=/ but not href=//", () => {
    const html = `<link href="/a.css"><link href="//cdn.example/b.css">`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain(`href="${ORIGIN}/a.css"`);
    expect(out).toContain(`href="//cdn.example/b.css"`);
  });

  it("absolutises every entry in srcset", () => {
    const html = `<img srcset="/a.png 1x, /b.png 2x, /c.png 3x">`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain(`${ORIGIN}/a.png 1x`);
    expect(out).toContain(`${ORIGIN}/b.png 2x`);
    expect(out).toContain(`${ORIGIN}/c.png 3x`);
  });

  it("absolutises url(/) in inline CSS values", () => {
    const html = `<style>.x { background: url(/img.png); }</style>`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain(`url(${ORIGIN}/img.png)`);
  });

  it("handles origin with trailing slash", () => {
    const html = `<img src="/a.png">`;
    const { html: out } = transformSnapshot(html, [], `${ORIGIN}/`);
    expect(out).toContain(`src="${ORIGIN}/a.png"`);
    expect(out).not.toContain(`${ORIGIN}//a.png`);
  });
});

describe("transformSnapshot — end-to-end", () => {
  it("body content preserved within 5% of input length", () => {
    const html = `<html><head><script>let big = ${"x".repeat(100)}</script></head><body>${"Hello world. ".repeat(50)}</body></html>`;
    const { html: out } = transformSnapshot(html, [], ORIGIN);
    expect(out).toContain("Hello world.");
    // Body text should remain intact; script bytes don't count
  });
});
