import { describe, expect, it } from "vitest";

import { CuratedManifestSchema } from "./manifest";

describe("CuratedManifestSchema", () => {
  it("accepts a manifest with zero entries (empty bundle)", () => {
    const result = CuratedManifestSchema.safeParse({ entries: [] });
    expect(result.success).toBe(true);
  });

  it("accepts a manifest with a single well-formed deck entry", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "french-basics",
          kind: "deck",
          title: "French — Basics",
          description: "200 starter words",
          language: "fr",
          cardCount: 200,
          curatedSourceId: "fr-basics-v1",
          version: 1,
          license: "CC-BY-SA 4.0",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a deck-set entry", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "medicine-semester-1",
          kind: "deck-set",
          title: "Medicine — Semester 1",
          cardCount: 5000,
          curatedSourceId: "med-s1",
          version: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects entries with duplicate curatedSourceId", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "a",
          kind: "deck",
          title: "A",
          cardCount: 1,
          curatedSourceId: "shared",
          version: 1,
        },
        {
          slug: "b",
          kind: "deck",
          title: "B",
          cardCount: 1,
          curatedSourceId: "shared",
          version: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("curatedSourceId"))).toBe(true);
    }
  });

  it("rejects entries with duplicate slug", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        { slug: "dup", kind: "deck", title: "A", cardCount: 1, curatedSourceId: "a", version: 1 },
        { slug: "dup", kind: "deck", title: "B", cardCount: 1, curatedSourceId: "b", version: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("slug"))).toBe(true);
    }
  });

  it("rejects a slug with uppercase letters", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "Bad-Slug",
          kind: "deck",
          title: "x",
          cardCount: 1,
          curatedSourceId: "x",
          version: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "x",
          kind: "something-else",
          title: "x",
          cardCount: 1,
          curatedSourceId: "x",
          version: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative cardCount", () => {
    const result = CuratedManifestSchema.safeParse({
      entries: [
        {
          slug: "x",
          kind: "deck",
          title: "x",
          cardCount: -1,
          curatedSourceId: "x",
          version: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
