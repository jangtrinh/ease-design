/**
 * The two spec-003 P2 layout-lint craft checks:
 *   clickable-no-pointer  (warning) — layout-checks-craft.ts
 *   font-display-missing  (warning) — layout-checks-craft.ts
 * Fixtures fire each prong plus passing negatives, then a wiring block drives them
 * through lintLayout() to prove registration (both are warnings — exit stays green).
 */
import { describe, expect, it } from "vitest";
import { checkClickableNoPointer, checkFontDisplayMissing } from "../src/core/layout-checks-craft.js";
import { lintLayout } from "../src/core/layout-lint.js";

// ─── clickable-no-pointer (warning) ─────────────────────────────────────────────

describe("clickable-no-pointer", () => {
  it("flags a <div onclick> with no cursor:pointer", () => {
    const f = checkClickableNoPointer('<div onclick="go()">Menu</div>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("clickable-no-pointer");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags a role=button carrier that lacks cursor:pointer", () => {
    expect(checkClickableNoPointer('<span role="button">Toggle</span>')).toHaveLength(1);
  });

  it("does NOT flag when cursor-pointer utility is present", () => {
    expect(checkClickableNoPointer('<div onclick="go()" class="cursor-pointer">Menu</div>')).toHaveLength(0);
  });

  it("does NOT flag when inline cursor:pointer is present", () => {
    expect(checkClickableNoPointer('<div role="button" style="cursor:pointer">Menu</div>')).toHaveLength(0);
  });

  it("does NOT flag when a CSS rule sets cursor:pointer on the element's class", () => {
    const html = '<style>.card{cursor:pointer}</style><div class="card" onclick="go()">Menu</div>';
    expect(checkClickableNoPointer(html)).toHaveLength(0);
  });

  it("does NOT flag native controls (they get the cursor for free)", () => {
    expect(checkClickableNoPointer('<button onclick="go()">Save</button>')).toHaveLength(0);
    expect(checkClickableNoPointer('<a href="#" onclick="go()">Link</a>')).toHaveLength(0);
  });

  it("does NOT flag a non-clickable div", () => {
    expect(checkClickableNoPointer('<div class="panel">content</div>')).toHaveLength(0);
  });
});

// ─── font-display-missing (warning) ─────────────────────────────────────────────

describe("font-display-missing", () => {
  it("flags an @font-face block with no font-display descriptor", () => {
    const f = checkFontDisplayMissing('<style>@font-face{font-family:Acme;src:url(a.woff2)}</style>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("font-display-missing");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags a Google-Fonts <link> with no display= param", () => {
    const f = checkFontDisplayMissing('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">');
    expect(f).toHaveLength(1);
  });

  it("does NOT flag an @font-face that declares font-display", () => {
    expect(checkFontDisplayMissing('<style>@font-face{font-family:Acme;font-display:swap;src:url(a.woff2)}</style>')).toHaveLength(0);
  });

  it("does NOT flag a Google-Fonts link carrying &display=swap", () => {
    expect(checkFontDisplayMissing('<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">')).toHaveLength(0);
  });

  it("does NOT flag a non-Google stylesheet link", () => {
    expect(checkFontDisplayMissing('<link rel="stylesheet" href="/css/app.css">')).toHaveLength(0);
  });
});

// ─── lintLayout wiring — both warnings, exit stays green ─────────────────────────

describe("lintLayout — P2 craft lints wired as warnings", () => {
  it("registers both and neither bumps errorCount", () => {
    const html = [
      "<!doctype html><html><body>",
      '<div onclick="go()">Menu</div>',
      "<style>@font-face{font-family:Acme;src:url(a.woff2)}</style>",
      "</body></html>",
    ].join("\n");
    const r = lintLayout(html);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("clickable-no-pointer")).toBe(true);
    expect(ids.has("font-display-missing")).toBe(true);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBeGreaterThanOrEqual(2);
  });
});
