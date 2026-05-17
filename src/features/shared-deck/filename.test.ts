import { describe, expect, it } from "vitest";

import { sharedDeckFilename, slugifyDeckName } from "./filename";

describe("slugifyDeckName", () => {
  it("lowercases and replaces whitespace with hyphens", () => {
    expect(slugifyDeckName("Hello World")).toBe("hello-world");
  });

  it("strips accents (NFKD) so non-ASCII names produce ASCII slugs", () => {
    expect(slugifyDeckName("Französisch — Vokabeln A2")).toBe("franzosisch-vokabeln-a2");
  });

  it("collapses runs of punctuation/whitespace into a single hyphen", () => {
    expect(slugifyDeckName("foo!!  bar??")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyDeckName("  --foo--  ")).toBe("foo");
  });

  it("falls back to `deck` when the name contains no slug-able characters", () => {
    expect(slugifyDeckName("###")).toBe("deck");
    expect(slugifyDeckName("")).toBe("deck");
  });

  it("caps the slug at 60 characters and re-trims trailing hyphens", () => {
    const slug = slugifyDeckName("a".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe("sharedDeckFilename", () => {
  it("appends -shared.json to the slug", () => {
    expect(sharedDeckFilename("Französisch — Vokabeln A2")).toBe(
      "franzosisch-vokabeln-a2-shared.json",
    );
  });

  it("falls back to deck-shared.json for unsluggable names", () => {
    expect(sharedDeckFilename("###")).toBe("deck-shared.json");
  });
});
