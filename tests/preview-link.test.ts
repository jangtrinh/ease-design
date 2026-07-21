/**
 * previewLink / figmaNote — the OSC-8-safe preview-link convention
 * (src/core/preview-link.ts). Pure module, no CLI — mirrors report-style.test.ts.
 */
import { describe, expect, it } from "vitest";
import { previewLink, figmaNote } from "../src/core/preview-link.js";

describe("previewLink", () => {
  it("emits a bare file:// + absolute path, no markdown brackets", () => {
    const line = previewLink("/abs/path/specimen.html");
    expect(line).toContain("file:///abs/path/specimen.html");
    expect(line).not.toContain("[");
    expect(line).not.toContain("]");
    expect(line).not.toContain("(");
    expect(line).not.toContain(")");
  });

  it("defaults the label to 'preview'", () => {
    const line = previewLink("/abs/path/specimen.html");
    expect(line.trim().startsWith("preview")).toBe(true);
  });

  it("accepts a custom label", () => {
    const line = previewLink("/abs/path/audit.md", "report");
    expect(line.trim().startsWith("report")).toBe(true);
    expect(line).toContain("file:///abs/path/audit.md");
  });

  it("never emits an inline image", () => {
    const line = previewLink("/abs/path/specimen.html");
    expect(line).not.toContain("![");
  });

  it("is deterministic", () => {
    expect(previewLink("/abs/x")).toBe(previewLink("/abs/x"));
  });

  it("percent-encodes spaces and reserved chars into a valid file URL", () => {
    const line = previewLink("/tmp/design preview/a b.html");
    expect(line).toContain("file:///tmp/design%20preview/a%20b.html");
    expect(line).not.toContain("design preview"); // raw space would break the URL
  });
});

describe("figmaNote", () => {
  it("is a stable one-liner naming figma-agent, not the ui kernel", () => {
    const note = figmaNote();
    expect(note).toContain("figma");
    expect(note).toContain("figma-agent");
    expect(note).toContain("ui does not construct Figma URLs");
  });

  it("is deterministic", () => {
    expect(figmaNote()).toBe(figmaNote());
  });
});
