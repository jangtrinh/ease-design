import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkTinyBodyText,
  checkOffGridSpacing,
  checkMixedIconFamilies,
  checkTextArrowAsInterfaceIcon,
  checkPureBlackShadow,
  checkLinearOrAllTransition,
  checkAnimationNoReducedMotion,
  checkKeyframesLayoutProps,
  checkRawHexWhenTokenExists,
} from "../src/core/taste-checks.js";
import { lintTaste } from "../src/core/taste-lint.js";
import { run } from "../src/cli.js";

// In-process CLI capture (mirrors cmd-validate-layout.test.ts).
function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

function writeTmp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ease-taste-"));
  const p = join(dir, name);
  writeFileSync(p, content, "utf8");
  return p;
}

// ─── checkTinyBodyText (Typography) ─────────────────────────────────────────────

describe("checkTinyBodyText", () => {
  it("flags an inline/style font-size ≤ 13px", () => {
    const f = checkTinyBodyText("<style>body{font-size:11px}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Typography");
    expect(f[0]?.checkId).toBe("tiny-body-text");
  });

  it("flags a Tailwind text-[Npx] ≤ 13px", () => {
    const f = checkTinyBodyText('<p class="text-[10px]">x</p>');
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBe(1);
  });

  it("does NOT flag 16px body", () => {
    expect(checkTinyBodyText("<style>body{font-size:16px}</style>")).toHaveLength(0);
  });

  it("does NOT flag 14px (left to the model — dense-UI grey zone)", () => {
    expect(checkTinyBodyText("<style>.cap{font-size:14px}</style>")).toHaveLength(0);
  });

  it("does NOT match font-size mentioned in body copy text", () => {
    // "font-size: 10px" appears as visible prose, not a CSS region → not matched
    expect(checkTinyBodyText("<p>Set your font-size: 10px in settings.</p>")).toHaveLength(0);
  });

  // ── role-aware rewrite (dogfood L2) ────────────────────────────────────────

  it("<style> body selector at 12px fires (body copy)", () => {
    expect(checkTinyBodyText("<style> p{font-size:12px}</style>")).toHaveLength(1);
  });

  it("<style> chrome-role selector (.badge) at 11px does NOT fire", () => {
    expect(checkTinyBodyText("<style> .badge{font-size:11px}</style>")).toHaveLength(0);
  });

  it("<style> body-ish selector (.description) at 13px fires — not a chrome role", () => {
    expect(checkTinyBodyText("<style> .description{font-size:13px}</style>")).toHaveLength(1);
  });

  it("<style> chrome-role selector (.badge) at 8px FIRES — below the abuse floor even for chrome", () => {
    expect(checkTinyBodyText("<style> .badge{font-size:8px}</style>")).toHaveLength(1);
  });

  it("inline style on a non-body element (<span>) at 12px does NOT fire", () => {
    expect(checkTinyBodyText('<span style="font-size:12px">x</span>')).toHaveLength(0);
  });

  it("inline style on a body element (<p>) at 12px fires", () => {
    expect(checkTinyBodyText('<p style="font-size:12px">x</p>')).toHaveLength(1);
  });

  it("Tailwind text-[12px] on a <div> does NOT fire; on a <p> fires", () => {
    expect(checkTinyBodyText('<div class="text-[12px]">x</div>')).toHaveLength(0);
    expect(checkTinyBodyText('<p class="text-[12px]">x</p>')).toHaveLength(1);
  });

  it("a size ≥14px never fires", () => {
    expect(checkTinyBodyText("<style>p{font-size:14px}</style>")).toHaveLength(0);
  });

  it("line number sanity: <style> rule violation reports the line the font-size token is on", () => {
    const css = [
      "<style>",             // line 1
      ".badge {",            // line 2
      "  color: red;",       // line 3
      "}",                   // line 4
      ".description {",      // line 5
      "  font-size: 13px;",  // line 6
      "}",                   // line 7
      "</style>",            // line 8
    ].join("\n");
    const f = checkTinyBodyText(css);
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBe(6);
  });
});

// ─── checkOffGridSpacing (Spacing) ──────────────────────────────────────────────

describe("checkOffGridSpacing", () => {
  it("flags an off-4px-grid padding value", () => {
    const f = checkOffGridSpacing('<div class="p-[13px]"></div>');
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Spacing");
  });

  it("flags off-grid margin and gap", () => {
    expect(checkOffGridSpacing('<div class="mt-[27px]"></div>')).toHaveLength(1);
    expect(checkOffGridSpacing('<div class="gap-[18px]"></div>')).toHaveLength(1);
  });

  it("does NOT flag on-grid multiples of 4", () => {
    expect(checkOffGridSpacing('<div class="p-[16px] mt-[8px] gap-[24px]"></div>')).toHaveLength(0);
  });

  it("does NOT flag sub-4px hairline nudges", () => {
    expect(checkOffGridSpacing('<div class="mt-[2px]"></div>')).toHaveLength(0);
  });

  it("does NOT flag non-spacing arbitrary utilities (border width)", () => {
    expect(checkOffGridSpacing('<div class="border-[3px]"></div>')).toHaveLength(0);
  });
});

// ─── checkMixedIconFamilies (Iconography) ───────────────────────────────────────

describe("checkMixedIconFamilies", () => {
  it("flags two icon families in one document", () => {
    const f = checkMixedIconFamilies('<i class="fas fa-home"></i><span data-lucide="user"></span>');
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Iconography");
    expect(f[0]?.message).toContain("Lucide");
    expect(f[0]?.message).toContain("Font Awesome");
  });

  it("does NOT flag a single family (Lucide, the project default)", () => {
    expect(checkMixedIconFamilies('<span data-lucide="user"></span><script>lucide.createIcons()</script>')).toHaveLength(0);
  });

  it("does NOT flag a document with no icons", () => {
    expect(checkMixedIconFamilies("<div>plain</div>")).toHaveLength(0);
  });

  it("recognizes Phosphor and flags it when mixed with another family", () => {
    const html = '<script src="@phosphor-icons/web"></script><span data-lucide="user"></span>';
    const findings = checkMixedIconFamilies(html);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("Phosphor");
  });
});

describe("checkTextArrowAsInterfaceIcon", () => {
  it("flags Unicode arrows used inside links and buttons", () => {
    const html = '<a href="/start">Get started ↗</a>\n<button>Continue →</button>';
    const findings = checkTextArrowAsInterfaceIcon(html);
    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.axis === "Iconography")).toBe(true);
    expect(findings[0]?.checkId).toBe("text-arrow-as-interface-icon");
  });

  it("flags Unicode arrows used as compact metric/status iconography", () => {
    const html = "<span>↗ 18% vs plan</span><strong>Revenue ↑</strong>";
    expect(checkTextArrowAsInterfaceIcon(html)).toHaveLength(2);
  });

  it("does not flag a Phosphor component in an interactive control", () => {
    const html = '<a href="/start">Get started <ArrowUpRight aria-hidden="true" /></a>';
    expect(checkTextArrowAsInterfaceIcon(html)).toHaveLength(0);
  });

  it("does not flag arrow characters in prose or code samples", () => {
    const html = "<p>Revenue → retention is the model.</p><code>left → right</code>";
    expect(checkTextArrowAsInterfaceIcon(html)).toHaveLength(0);
  });
});

// ─── checkPureBlackShadow (Depth/Surface) ───────────────────────────────────────

describe("checkPureBlackShadow", () => {
  it("flags a #000000 box-shadow", () => {
    const f = checkPureBlackShadow("<style>.c{box-shadow:0 4px 8px #000000}</style>");
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f[0]?.axis).toBe("Depth/Surface");
  });

  it("flags a hard rgba black (alpha ≥ 0.5)", () => {
    expect(checkPureBlackShadow("<style>.c{box-shadow:0 2px 4px rgba(0,0,0,0.8)}</style>").length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag a soft low-alpha black shadow (conventional)", () => {
    expect(checkPureBlackShadow("<style>.c{box-shadow:0 4px 12px rgba(0,0,0,0.12)}</style>")).toHaveLength(0);
  });

  it("does NOT flag a tinted shadow", () => {
    expect(checkPureBlackShadow("<style>.c{box-shadow:0 4px 12px rgba(30,20,10,0.3)}</style>")).toHaveLength(0);
  });

  it("flags a Tailwind shadow-[...] with pure black", () => {
    expect(checkPureBlackShadow('<div class="shadow-[0_4px_8px_#000]"></div>').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── checkLinearOrAllTransition (Motion) ────────────────────────────────────────

describe("checkLinearOrAllTransition", () => {
  it("flags linear easing", () => {
    const f = checkLinearOrAllTransition("<style>.c{transition:transform 0.2s linear}</style>");
    expect(f.some((x) => x.checkId === "linear-easing")).toBe(true);
    expect(f[0]?.axis).toBe("Motion");
  });

  it("flags transition: all", () => {
    const f = checkLinearOrAllTransition("<style>.c{transition:all 0.3s ease}</style>");
    expect(f.some((x) => x.checkId === "transition-all")).toBe(true);
  });

  it("does NOT flag a proper directional easing on a named property", () => {
    expect(checkLinearOrAllTransition("<style>.c{transition:opacity 0.2s ease-out}</style>")).toHaveLength(0);
  });

  it("does NOT match the word 'linear' in body copy", () => {
    expect(checkLinearOrAllTransition("<p>A linear regression model.</p>")).toHaveLength(0);
  });
});

// ─── checkAnimationNoReducedMotion (Motion) ─────────────────────────────────────

describe("checkAnimationNoReducedMotion", () => {
  it("flags @keyframes with no reduced-motion guard", () => {
    const f = checkAnimationNoReducedMotion("<style>@keyframes spin{from{opacity:0}to{opacity:1}}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Motion");
    expect(f[0]?.checkId).toBe("animation-no-reduced-motion");
  });

  it("flags an `animation:` shorthand with no guard", () => {
    expect(checkAnimationNoReducedMotion("<style>.c{animation:spin 1s infinite}</style>")).toHaveLength(1);
  });

  it("flags a gsap <script src> with no guard", () => {
    const html = '<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>';
    expect(checkAnimationNoReducedMotion(html)).toHaveLength(1);
  });

  it("is clean when a @media (prefers-reduced-motion) block is present", () => {
    const html = [
      "<style>@keyframes spin{from{opacity:0}to{opacity:1}}",
      "@media (prefers-reduced-motion: reduce){*{animation:none}}</style>",
    ].join("");
    expect(checkAnimationNoReducedMotion(html)).toHaveLength(0);
  });

  it("is clean when a JS matchMedia reduced-motion guard is present alongside a lib", () => {
    const html = [
      '<script src="https://cdn.jsdelivr.net/npm/animejs@4/+esm"></script>',
      '<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches){animate(".x",{})}</script>',
    ].join("");
    expect(checkAnimationNoReducedMotion(html)).toHaveLength(0);
  });

  it("does NOT flag the word 'animation' in body copy", () => {
    expect(checkAnimationNoReducedMotion("<p>Our animation studio ships motion design.</p>")).toHaveLength(0);
  });

  it("does NOT flag a page with only transitions (no keyframes/animation/lib)", () => {
    expect(checkAnimationNoReducedMotion("<style>.c{transition:transform 0.2s ease-out}</style>")).toHaveLength(0);
  });
});

// ─── checkKeyframesLayoutProps (Motion) ─────────────────────────────────────────

describe("checkKeyframesLayoutProps", () => {
  it("flags @keyframes animating width, naming the property and keyframes name", () => {
    const f = checkKeyframesLayoutProps("<style>@keyframes grow{from{width:0}to{width:100%}}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Motion");
    expect(f[0]?.checkId).toBe("keyframes-layout-props");
    expect(f[0]?.message).toContain("width");
    expect(f[0]?.message).toContain("grow");
  });

  it("flags an animated margin-left (naming the hyphenated property)", () => {
    const f = checkKeyframesLayoutProps("<style>@keyframes slide{from{margin-left:0}to{margin-left:40px}}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("margin-left");
  });

  it("does NOT flag transform/opacity-only keyframes", () => {
    const clean = "<style>@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}</style>";
    expect(checkKeyframesLayoutProps(clean)).toHaveLength(0);
  });

  it("does NOT false-positive on max-width / line-height (declaration-boundary anchored)", () => {
    const html = "<style>@keyframes z{from{max-width:0;line-height:1.2;transform:scale(0.9)}to{transform:scale(1)}}</style>";
    expect(checkKeyframesLayoutProps(html)).toHaveLength(0);
  });

  it("emits one finding per keyframes block even with several layout props", () => {
    const html = "<style>@keyframes m{from{width:0;height:0;top:0}to{width:9px}}</style>";
    expect(checkKeyframesLayoutProps(html)).toHaveLength(1);
  });

  it("does NOT flag when there are no keyframes at all", () => {
    expect(checkKeyframesLayoutProps("<style>.c{width:100%;transition:opacity .2s ease-out}</style>")).toHaveLength(0);
  });
});

// ─── checkRawHexWhenTokenExists (Consistency) ───────────────────────────────────

describe("checkRawHexWhenTokenExists", () => {
  const tokens = new Set(["#896d31", "#0d0d0d"]);

  it("is skipped entirely when no token set is supplied", () => {
    expect(checkRawHexWhenTokenExists('<div class="bg-[#abcdef]"></div>', undefined)).toHaveLength(0);
  });

  it("flags an arbitrary hex NOT in the palette", () => {
    const f = checkRawHexWhenTokenExists('<div class="bg-[#abcdef]"></div>', tokens);
    expect(f).toHaveLength(1);
    expect(f[0]?.axis).toBe("Consistency");
  });

  it("does NOT flag a hex that IS a palette token", () => {
    expect(checkRawHexWhenTokenExists('<div class="bg-[#896D31]"></div>', tokens)).toHaveLength(0);
  });

  it("normalises 3-digit hex against 6-digit tokens", () => {
    const t = new Set(["#ffffff"]);
    expect(checkRawHexWhenTokenExists('<div class="bg-[#fff]"></div>', t)).toHaveLength(0);
  });

  it("flags an inline-style invented hex", () => {
    const f = checkRawHexWhenTokenExists('<div style="color:#123456"></div>', tokens);
    expect(f).toHaveLength(1);
  });
});

// ─── lintTaste orchestrator ─────────────────────────────────────────────────────

describe("lintTaste", () => {
  it("returns zero findings for a clean DS-faithful variant", () => {
    const clean = [
      "<!doctype html><html><head><style>",
      "body{font-size:16px;transition:transform 0.2s ease-out}",
      ".card{box-shadow:0 4px 12px rgba(30,20,10,0.18)}",
      "</style></head><body class='bg-surface text-text-body'>",
      "<span data-lucide='user'></span>",
      "<div class='p-4 mt-8 gap-6 rounded-md'>Hi</div>",
      "<p class='text-[18px]'>Readable copy.</p>",
      "</body></html>",
    ].join("\n");
    const r = lintTaste(clean);
    expect(r.errorCount).toBe(0);
    expect(r.findings).toHaveLength(0);
    expect(r.axesAffected).toHaveLength(0);
  });

  it("aggregates violations across axes, sorted by rubric order", () => {
    const bad = [
      "<style>body{font-size:11px;transition:all 0.3s linear}",
      ".c{box-shadow:0 4px 8px #000}</style>",
      '<i class="fas fa-home"></i><span data-lucide="x"></span>',
      '<div class="mt-[27px]"></div>',
    ].join("\n");
    const r = lintTaste(bad);
    expect(r.errorCount).toBeGreaterThanOrEqual(5);
    // Axes appear in rubric order: Typography < Spacing < Motion < Iconography < Depth/Surface
    const idx = (ax: string) => r.axesAffected.indexOf(ax as never);
    expect(idx("Typography")).toBeLessThan(idx("Spacing"));
    expect(idx("Spacing")).toBeLessThan(idx("Motion"));
    expect(idx("Motion")).toBeLessThan(idx("Iconography"));
  });

  it("does not trip on a commented-out AI_CRITIQUE_LOG block", () => {
    // critique.md writes an HTML comment at the top of variants — must be ignored.
    const withLog = [
      "<!-- AI_CRITIQUE_LOG round=1: font-size 9px linear all #000 fa-home -->",
      "<!doctype html><html><body><p class='text-[18px]'>ok</p></body></html>",
    ].join("\n");
    expect(lintTaste(withLog).errorCount).toBe(0);
  });

  it("activates the Consistency check only with knownHexes", () => {
    const html = '<div class="bg-[#abcdef]"></div>';
    expect(lintTaste(html).errorCount).toBe(0);
    expect(lintTaste(html, { knownHexes: new Set(["#000000"]) }).errorCount).toBe(1);
  });
});

// ─── ui taste-lint command ──────────────────────────────────────────────────────

describe("ui taste-lint — command", () => {
  const CLEAN = "<!doctype html><html><body><p class='text-[18px]'>ok</p></body></html>";
  const DIRTY = "<!doctype html><html><body><p class='text-[10px]'>x</p></body></html>";

  it("exits 0 with errorCount 0 on a clean file (--json)", () => {
    const p = writeTmp("clean.html", CLEAN);
    const { code, out } = captureRun(["taste-lint", p, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { errorCount: number } };
    expect(json.ok).toBe(true);
    expect(json.data.errorCount).toBe(0);
  });

  it("exits 0 in text mode and reports no violations", () => {
    const p = writeTmp("clean.html", CLEAN);
    const { code, out } = captureRun(["taste-lint", p]);
    expect(code).toBe(0);
    expect(out).toContain("0 violation(s)");
  });

  it("exits 1 with violations on a dirty file (--json)", () => {
    const p = writeTmp("dirty.html", DIRTY);
    const { code, out } = captureRun(["taste-lint", p, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { data: { errorCount: number; axesAffected: string[] } };
    expect(json.data.errorCount).toBeGreaterThanOrEqual(1);
    expect(json.data.axesAffected).toContain("Typography");
  });

  it("exits 1 with FILE_NOT_FOUND on a missing file (--json)", () => {
    const { code, out } = captureRun(["taste-lint", "/no/such/file.html", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("exits 1 with BAD_ARG when no file argument is given (--json)", () => {
    const { code, out } = captureRun(["taste-lint", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("uses --tokens to activate the Consistency check", () => {
    const tokens = JSON.stringify({ primary: { "500": { $type: "color", $value: "#896D31" } } });
    const tp = writeTmp("design.tokens.json", tokens);
    const html = writeTmp("mixed.html", '<div class="bg-[#abcdef]">x</div>');
    const { code, out } = captureRun(["taste-lint", html, "--tokens", tp, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { data: { axesAffected: string[] } };
    expect(json.data.axesAffected).toContain("Consistency");
  });
});
