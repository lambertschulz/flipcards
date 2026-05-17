import { describe, expect, it } from "vitest";

import { sharedDeckSetFilename, slugifyDeckSetName } from "./filename";

describe("slugifyDeckSetName", () => {
  it("lowercases and replaces whitespace with hyphens", () => {
    expect(slugifyDeckSetName("Medizin 1. Semester")).toBe("medizin-1-semester");
  });

  it("strips accents (NFKD) so non-ASCII names produce ASCII slugs", () => {
    expect(slugifyDeckSetName("Sprachen — Französisch & Italienisch")).toBe(
      "sprachen-franzosisch-italienisch",
    );
  });

  it("falls back to `deckset` when the name contains no slug-able characters", () => {
    expect(slugifyDeckSetName("###")).toBe("deckset");
    expect(slugifyDeckSetName("")).toBe("deckset");
  });

  it("caps the slug at 60 characters and re-trims trailing hyphens", () => {
    const slug = slugifyDeckSetName("a".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe("sharedDeckSetFilename", () => {
  it("appends -shared.json to the slug", () => {
    expect(sharedDeckSetFilename("Medizin 1. Semester")).toBe("medizin-1-semester-shared.json");
  });

  it("falls back to deckset-shared.json for unsluggable names", () => {
    expect(sharedDeckSetFilename("###")).toBe("deckset-shared.json");
  });
});
