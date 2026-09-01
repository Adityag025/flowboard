import { describe, expect, it } from "vitest";

import { slugSuffix, slugify } from "./workspaces";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Aditya Gupta")).toBe("aditya-gupta");
  });

  it("collapses runs of non-alphanumerics into one hyphen", () => {
    expect(slugify("Acme  Inc. &  Co")).toBe("acme-inc-co");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  !Hello!  ")).toBe("hello");
  });

  it("keeps digits", () => {
    expect(slugify("Team 42")).toBe("team-42");
  });

  it("returns an empty string when nothing survives", () => {
    // Worth knowing rather than assuming: a name of only punctuation produces
    // "", which is why signup appends a suffix on collision rather than relying
    // on the slug alone being meaningful.
    expect(slugify("!!!")).toBe("");
  });

  it("does not produce characters that need URL escaping", () => {
    const slug = slugify("Ünïcodé — Wörkspace / v2");
    expect(slug).toBe(encodeURIComponent(slug));
  });
});

describe("slugSuffix", () => {
  it("returns a short alphanumeric string", () => {
    expect(slugSuffix()).toMatch(/^[a-z0-9]{1,6}$/);
  });

  it("is different across calls often enough to break collisions", () => {
    const seen = new Set(Array.from({ length: 200 }, () => slugSuffix()));
    // Not asserting all-unique -- it is random, so that would be flaky. We only
    // need it to be varied enough that a retry loop terminates.
    expect(seen.size).toBeGreaterThan(150);
  });
});
