// Pure-logic tests for the page-shot envelope + human renderer + the output-naming rule.
// No browser: these build synthetic ShotData and assert shape/text/stem, so they always run.
import { describe, it, expect } from "vitest";

import { okEnv, errEnv, formatText, stem, COMMAND } from "../cli/src/shot-envelope.ts";
import type { ShotData } from "../cli/src/shot-types.ts";

const CLEAN: ShotData = {
  shots: [
    { target: "control-button.html", file: "control-button.png", bytes: 1234 },
    { target: "display-card.html", file: "display-card.png", bytes: 2048 },
  ],
  errors: [],
  out: "shots",
  total: 2,
};

const PARTIAL: ShotData = {
  shots: [{ target: "ok.html", file: "ok.png", bytes: 512 }],
  errors: [{ target: "nope.html", error: "net::ERR_FILE_NOT_FOUND" }],
  out: "shots",
  total: 2,
};

describe("okEnv / errEnv", () => {
  it("wraps data in the ui-kernel success envelope shape", () => {
    const env = okEnv(CLEAN);
    expect(env).toEqual({ ok: true, command: "page-shot", data: CLEAN });
    expect(COMMAND).toBe("page-shot");
  });

  it("wraps an error in the ui-kernel failure envelope shape", () => {
    const env = errEnv("NO_OUT", "--out <dir> is required");
    expect(env.ok).toBe(false);
    expect(env.command).toBe("page-shot");
    expect(env.error).toEqual({ code: "NO_OUT", message: "--out <dir> is required" });
  });
});

describe("stem — output PNG naming", () => {
  it("drops the final extension of a file name", () => {
    expect(stem("control-button.html")).toBe("control-button");
    expect(stem("/tmp/split/display-card.html")).toBe("display-card");
    expect(stem("a.b.c.html")).toBe("a.b.c");
  });

  it("strips URL query/hash and keeps the last path segment", () => {
    expect(stem("https://example.com/app.html?v=2")).toBe("app");
    expect(stem("https://example.com/page.html#top")).toBe("page");
  });

  it("keeps an extension-less base as-is, and falls back to 'page' for an empty one", () => {
    expect(stem("plainname")).toBe("plainname");
    expect(stem("/")).toBe("page");
    expect(stem("")).toBe("page");
  });
});

describe("formatText", () => {
  it("renders one target → file (bytes) line per shot and a rendered/total summary", () => {
    const out = formatText(CLEAN);
    expect(out).toContain("page-shot: control-button.html → control-button.png (1234 bytes)");
    expect(out).toContain("page-shot: display-card.html → display-card.png (2048 bytes)");
    expect(out).toContain("page-shot: 2/2 rendered → shots");
    expect(out).not.toContain("failed");
  });

  it("renders a `! target: error` line per failure and tallies the failed count", () => {
    const out = formatText(PARTIAL);
    expect(out).toContain("page-shot: ok.html → ok.png (512 bytes)");
    expect(out).toContain("page-shot: ! nope.html: net::ERR_FILE_NOT_FOUND");
    expect(out).toContain("page-shot: 1/2 rendered → shots, 1 failed");
  });
});
