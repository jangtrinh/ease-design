import { describe, expect, it } from "vitest";
import { lintLayout } from "../src/core/layout-lint.js";

// ─── Clean document ───────────────────────────────────────────────────────────

describe("lintLayout — clean document", () => {
  const goodHtml = `<!doctype html>
<html lang="en">
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>T</title></head>
<body>
<header><nav><a href="/">Home</a></nav></header>
<main><section><article><h1>Hi</h1></article></section></main>
<footer><p>Footer</p></footer>
</body>
</html>`;

  it("returns 0 findings on a well-formed document", () => {
    const { findings } = lintLayout(goodHtml);
    expect(findings).toHaveLength(0);
  });

  it("errorCount and warningCount are both 0", () => {
    const { errorCount, warningCount } = lintLayout(goodHtml);
    expect(errorCount).toBe(0);
    expect(warningCount).toBe(0);
  });
});

// ─── Error-severity checks ────────────────────────────────────────────────────

describe("lintLayout — missing-html-root", () => {
  it("flags error when no <html tag present", () => {
    const html = "<!doctype html><head></head><body><p>hi</p></body>";
    const { findings, errorCount } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "missing-html-root")).toBe(true);
    expect(errorCount).toBeGreaterThan(0);
  });

  it("does not flag when <html> is present", () => {
    const html = "<!doctype html><html><body><p>hi</p></body></html>";
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "missing-html-root")).toBe(false);
  });
});

describe("lintLayout — missing-body", () => {
  it("flags error when no <body tag present", () => {
    const html = "<!doctype html><html><head></head></html>";
    const { findings } = lintLayout(html);
    const bodyFindings = findings.filter((f) => f.checkId === "missing-body");
    expect(bodyFindings.length).toBeGreaterThan(0);
    expect(bodyFindings[0]?.severity).toBe("error");
  });
});

describe("lintLayout — unclosed-structural-tag", () => {
  it("flags error for unbalanced <div>", () => {
    const html = "<!doctype html><html><body><div><div></div></body></html>";
    const { findings } = lintLayout(html);
    const f = findings.filter((f) => f.checkId === "unclosed-structural-tag");
    expect(f.some((x) => x.message.includes("div"))).toBe(true);
    expect(f[0]?.severity).toBe("error");
  });

  it("does not flag balanced tags", () => {
    const html = "<!doctype html><html><body><div><p>hi</p></div></body></html>";
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "unclosed-structural-tag")).toBe(false);
  });
});

// ─── Warning-severity checks ──────────────────────────────────────────────────

describe("lintLayout — missing-doctype", () => {
  it("flags warning when doctype absent", () => {
    const html = "<html><body><p>hi</p></body></html>";
    const { findings } = lintLayout(html);
    const f = findings.find((f) => f.checkId === "missing-doctype");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
  });

  it("does not flag when <!doctype html> present", () => {
    const html = "<!doctype html><html><body></body></html>";
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "missing-doctype")).toBe(false);
  });
});

describe("lintLayout — fixed-width-overflow", () => {
  it("flags warning for inline width > 1280px", () => {
    const html = '<!doctype html><html><body><div style="width: 1600px;">x</div></body></html>';
    const { findings, warningCount } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "fixed-width-overflow")).toBe(true);
    expect(warningCount).toBeGreaterThan(0);
  });

  it("does not flag inline width <= 1280px", () => {
    const html = '<!doctype html><html><body><div style="width: 1280px;">x</div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "fixed-width-overflow")).toBe(false);
  });

  it("flags Tailwind w-[NNNNpx] > 1280", () => {
    const html = '<!doctype html><html><body><div class="w-[1400px]">x</div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "fixed-width-overflow")).toBe(true);
  });

  it("includes line number in finding", () => {
    const html = '<!doctype html>\n<html>\n<body>\n<div style="width: 1600px;">x</div>\n</body></html>';
    const { findings } = lintLayout(html);
    const f = findings.find((f) => f.checkId === "fixed-width-overflow");
    expect(f?.line).toBeDefined();
    expect(typeof f?.line).toBe("number");
  });
});

describe("lintLayout — viewport-unit-on-body", () => {
  it("flags warning for w-screen on <body>", () => {
    const html = '<!doctype html><html><body class="w-screen"><main></main></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "viewport-unit-on-body")).toBe(true);
  });

  it("flags warning for width:100vw on <html>", () => {
    const html = '<!doctype html><html style="width:100vw"><body></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "viewport-unit-on-body")).toBe(true);
  });
});

describe("lintLayout — nested-scroll-container", () => {
  it("flags warning when 2+ scroll containers present", () => {
    const html = '<!doctype html><html><body><div style="overflow:auto"><div style="overflow:scroll"></div></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "nested-scroll-container")).toBe(true);
  });

  it("does not flag a single scroll container", () => {
    const html = '<!doctype html><html><body><div style="overflow:auto"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "nested-scroll-container")).toBe(false);
  });
});

describe("lintLayout — absolute-without-relative", () => {
  it("flags warning when absolute present but no relative anchor", () => {
    const html = '<!doctype html><html><body><div class="absolute top-0">x</div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "absolute-without-relative")).toBe(true);
  });

  it("does not flag when relative anchor is present", () => {
    const html = '<!doctype html><html><body><div class="relative"><div class="absolute">x</div></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "absolute-without-relative")).toBe(false);
  });
});

describe("lintLayout — img-no-dimensions", () => {
  it("flags warning for <img> without width/height and no Tailwind size class", () => {
    const html = '<!doctype html><html><body><img src="a.jpg" alt="a"></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "img-no-dimensions")).toBe(true);
  });

  it("does not flag <img> with width attribute", () => {
    const html = '<!doctype html><html><body><img src="a.jpg" width="400" height="300"></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "img-no-dimensions")).toBe(false);
  });

  it("does not flag <img> with Tailwind w- class", () => {
    const html = '<!doctype html><html><body><img src="a.jpg" class="w-full h-auto"></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "img-no-dimensions")).toBe(false);
  });
});

describe("lintLayout — empty-flex-grid", () => {
  it("flags warning for structurally empty flex container", () => {
    const html = '<!doctype html><html><body><div class="flex"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(true);
  });

  it("flags warning for structurally empty grid container", () => {
    const html = '<!doctype html><html><body><div class="grid"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(true);
  });

  it("does not flag flex container with child elements", () => {
    const html = '<!doctype html><html><body><div class="flex"><span>item</span></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(false);
  });

  it("does not flag flex container with text content", () => {
    // Text-only content is visible; not a collapsed region.
    const html = '<!doctype html><html><body><div class="flex">some text</div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(false);
  });

  it("does not flag compound class flex-grow (not a standalone flex display class)", () => {
    // flex-grow is a flex-item utility, not a flex container declaration.
    const html = '<!doctype html><html><body><div class="flex-grow"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(false);
  });

  it("does not flag flex-col (direction modifier, not standalone flex)", () => {
    const html = '<!doctype html><html><body><div class="flex-col"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(false);
  });

  it("does not flag grid-cols-3 (grid layout modifier, not standalone grid)", () => {
    const html = '<!doctype html><html><body><div class="grid-cols-3"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "empty-flex-grid")).toBe(false);
  });
});

describe("lintLayout — css-100vw-width", () => {
  it("flags a width:100vw inside a <style> rule", () => {
    const html = '<!doctype html><html><body><style>.hero{width:100vw}</style><div class="hero"></div></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "css-100vw-width")).toBe(true);
  });

  it("flags max-width:100vw too", () => {
    const html = '<!doctype html><html><body><style>.wrap{max-width:100vw}</style></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "css-100vw-width")).toBe(true);
  });

  it("does NOT flag width:100% (the correct value)", () => {
    const html = '<!doctype html><html><body><style>.hero{width:100%}</style></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "css-100vw-width")).toBe(false);
  });
});

describe("lintLayout — root-overflow-x-hidden", () => {
  it("flags overflow-x:hidden on body", () => {
    const html = '<!doctype html><html><body><style>body{overflow-x:hidden}</style></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "root-overflow-x-hidden")).toBe(true);
  });

  it("appends a 'USES sticky' note when the page also uses position:sticky", () => {
    const html = '<!doctype html><html><body><style>html{overflow-x:hidden}.nav{position:sticky;top:0}</style></body></html>';
    const { findings } = lintLayout(html);
    const f = findings.find((x) => x.checkId === "root-overflow-x-hidden");
    expect(f).toBeDefined();
    expect(f?.message).toContain("USES sticky");
  });

  it("does NOT flag overflow-x:clip (the sticky-safe alternative)", () => {
    const html = '<!doctype html><html><body><style>body{overflow-x:clip}</style></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "root-overflow-x-hidden")).toBe(false);
  });

  it("does NOT flag overflow-x:hidden on a non-root class (.body-text)", () => {
    const html = '<!doctype html><html><body><style>.body-text{overflow-x:hidden}</style></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "root-overflow-x-hidden")).toBe(false);
  });
});

// ─── Delivery-asset discipline (P4) ───────────────────────────────────────────

describe("lintLayout — avoidable-screenshot-crop", () => {
  it("flags a crops/ img when a same-role real/ original is referenced", () => {
    const html = [
      "<!doctype html><html><body>",
      '<img src="assets/crops/hero.png" width="800" height="600">',
      '<img src="assets/real/hero.webp" width="1560" height="1248">',
      "</body></html>",
    ].join("\n");
    const { findings } = lintLayout(html);
    const f = findings.find((x) => x.checkId === "avoidable-screenshot-crop");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.line).toBeDefined();
  });

  it("matches across dimension/extension differences (crops/hero-1560x1248.png ↔ real/hero.webp)", () => {
    const html = [
      "<!doctype html><html><body>",
      '<img src="/assets/real/hero.webp" width="1560" height="1248">',
      '<img src="/assets/crops/hero-1560x1248.png" width="800" height="600">',
      "</body></html>",
    ].join("");
    const { findings } = lintLayout(html);
    expect(findings.some((x) => x.checkId === "avoidable-screenshot-crop")).toBe(true);
  });

  it("does NOT flag a lone crops/ img with no real/ counterpart (precision-first)", () => {
    const html = '<!doctype html><html><body><img src="assets/crops/hero.png" width="8" height="6"></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((x) => x.checkId === "avoidable-screenshot-crop")).toBe(false);
  });

  it("does NOT flag when the crop's stem differs from every real/ stem", () => {
    const html = [
      "<!doctype html><html><body>",
      '<img src="assets/real/logo.svg" width="120" height="40">',
      '<img src="assets/crops/hero.png" width="800" height="600">',
      "</body></html>",
    ].join("");
    const { findings } = lintLayout(html);
    expect(findings.some((x) => x.checkId === "avoidable-screenshot-crop")).toBe(false);
  });

  it("does NOT flag two real/ images (no crop present)", () => {
    const html = [
      "<!doctype html><html><body>",
      '<img src="assets/real/a.png" width="100" height="100">',
      '<img src="assets/real/b.png" width="100" height="100">',
      "</body></html>",
    ].join("");
    const { findings } = lintLayout(html);
    expect(findings.some((x) => x.checkId === "avoidable-screenshot-crop")).toBe(false);
  });

  it("does NOT flag a commented-out crops/ img", () => {
    const html = [
      "<!doctype html><html><body>",
      '<img src="assets/real/hero.webp" width="1560" height="1248">',
      '<!-- <img src="assets/crops/hero.png"> -->',
      "</body></html>",
    ].join("");
    const { findings } = lintLayout(html);
    expect(findings.some((x) => x.checkId === "avoidable-screenshot-crop")).toBe(false);
  });
});

// ─── Comment stripping ────────────────────────────────────────────────────────

describe("lintLayout — HTML comments do not trigger findings", () => {
  it("commented-out wide div does not trigger fixed-width-overflow", () => {
    const html = '<!doctype html><html><body><!-- <div style="width:9999px">x</div> --></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "fixed-width-overflow")).toBe(false);
  });

  it("commented-out structural tags do not trigger unclosed-structural-tag", () => {
    // Comment contains an unmatched open <div> — should not count toward open tally.
    const html = '<!doctype html><html><body><!-- <div class="removed"> --></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "unclosed-structural-tag")).toBe(false);
  });

  it("commented-out img does not trigger img-no-dimensions", () => {
    const html = '<!doctype html><html><body><!-- <img src="x.jpg"> --></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "img-no-dimensions")).toBe(false);
  });

  it("commented-out absolute class does not trigger absolute-without-relative", () => {
    const html = '<!doctype html><html><body><!-- <div class="absolute">x</div> --></body></html>';
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "absolute-without-relative")).toBe(false);
  });
});

// ─── Redirect-stub exemption (L4) ─────────────────────────────────────────────

describe("lintLayout — redirect-stub exemption (L4)", () => {
  it("a one-line meta-refresh stub produces 0 findings (no structural noise)", () => {
    const html = '<!doctype html><meta http-equiv="refresh" content="0; url=overview.html">';
    const { findings, errorCount, warningCount } = lintLayout(html);
    expect(findings).toHaveLength(0);
    expect(errorCount).toBe(0);
    expect(warningCount).toBe(0);
  });

  it("does NOT skip a document with meta-refresh but real body copy (>40 chars)", () => {
    const html = [
      '<meta http-equiv="refresh" content="0; url=overview.html">',
      "<p>This page has substantial body copy describing the product in detail, not a stub.</p>",
    ].join("");
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "missing-html-root")).toBe(true);
    expect(findings.some((f) => f.checkId === "missing-body")).toBe(true);
  });

  it("REGRESSION: no meta-refresh, no <body> still fires missing-body (skip stays narrow)", () => {
    const html = "<!doctype html><html><head><title>Real page</title></head></html>";
    const { findings } = lintLayout(html);
    expect(findings.some((f) => f.checkId === "missing-body")).toBe(true);
  });
});

// ─── Ordering and counts ──────────────────────────────────────────────────────

describe("lintLayout — findings ordering and counts", () => {
  it("all error findings come before warning findings", () => {
    const html = '<html><body><div style="width:1600px">x</div></body></html>';
    const { findings } = lintLayout(html);
    let seenWarning = false;
    for (const f of findings) {
      if (f.severity === "warning") seenWarning = true;
      if (f.severity === "error" && seenWarning) {
        throw new Error("error finding appeared after warning finding");
      }
    }
  });

  it("errorCount + warningCount equals findings.length", () => {
    const html = '<!doctype html><html><body><div style="width:1600px">x</div><img src="a.jpg"></body></html>';
    const { findings, errorCount, warningCount } = lintLayout(html);
    expect(errorCount + warningCount).toBe(findings.length);
  });
});
