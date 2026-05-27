import { describe, expect, it } from "vitest";
import { deriveSlug, SlugError } from "../src/core/url-slug.js";

describe("deriveSlug — URL forms", () => {
  it("strips www. and joins host with dashes", () => {
    expect(deriveSlug("https://www.traicaybentre.com/")).toBe("traicaybentre-com");
  });

  it("handles host without www.", () => {
    expect(deriveSlug("https://stripe.com")).toBe("stripe-com");
  });

  it("handles host with path (path is ignored)", () => {
    expect(deriveSlug("https://nextjs.org/docs")).toBe("nextjs-org");
  });

  it("lowercases the host", () => {
    expect(deriveSlug("https://EXAMPLE.COM/")).toBe("example-com");
  });

  it("handles multi-segment subdomains", () => {
    expect(deriveSlug("https://blog.example.co.uk/post")).toBe("blog-example-co-uk");
  });

  it("strips www. only when at the start (not mid-host)", () => {
    expect(deriveSlug("https://api.www.example.com/")).toBe("api-www-example-com");
  });
});

describe("deriveSlug — override forms", () => {
  it("accepts a kebab-case override", () => {
    expect(deriveSlug("https://anything.example.com/", "my-brand")).toBe("my-brand");
  });

  it("accepts a single-token override", () => {
    expect(deriveSlug("https://x.example.com/", "brand")).toBe("brand");
  });

  it("accepts override with digits", () => {
    expect(deriveSlug("https://x.example.com/", "brand-v2")).toBe("brand-v2");
  });

  it("rejects override with uppercase", () => {
    expect(() => deriveSlug("https://x.example.com/", "MyBrand")).toThrow(SlugError);
  });

  it("rejects override with spaces", () => {
    expect(() => deriveSlug("https://x.example.com/", "my brand")).toThrow(SlugError);
  });

  it("rejects override with leading dash", () => {
    expect(() => deriveSlug("https://x.example.com/", "-brand")).toThrow(SlugError);
  });

  it("rejects empty override (falls back to URL)", () => {
    // Empty string is explicitly invalid — caller should pass undefined to fall back
    expect(() => deriveSlug("https://x.example.com/", "")).toThrow(SlugError);
  });

  it("rejects override > 64 chars", () => {
    const long = "a".repeat(65);
    expect(() => deriveSlug("https://x.example.com/", long)).toThrow(SlugError);
  });
});

describe("deriveSlug — malformed URLs", () => {
  it("throws BAD_URL on garbage", () => {
    expect(() => deriveSlug("not a url")).toThrow(SlugError);
  });

  it("throws BAD_URL on empty string", () => {
    expect(() => deriveSlug("")).toThrow(SlugError);
  });

  it("error code is BAD_URL on bad URL", () => {
    try {
      deriveSlug("not a url");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SlugError);
      expect((e as SlugError).code).toBe("BAD_URL");
    }
  });

  it("error code is BAD_NAME on bad override", () => {
    try {
      deriveSlug("https://x.example.com/", "Has Space");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SlugError);
      expect((e as SlugError).code).toBe("BAD_NAME");
    }
  });
});
