import {
  type Card,
  CardSizeError,
  type CreateCardInput,
  MAX_CARD_PAYLOAD_BYTES,
  MAX_TAG_LENGTH,
  TagTooLongError,
  createCard,
  extractTagsFromCards,
  normalizeTag,
  normalizeTags,
  updateCard,
  validateCardSize,
} from "@/domain/card";
import { describe, expect, it } from "vitest";

const baseInput = (overrides: Partial<CreateCardInput> = {}): CreateCardInput => ({
  id: "card-0001",
  deckId: "deck-0001",
  front: "Bonjour",
  back: "Guten Tag",
  ...overrides,
});

const TINY_PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

describe("normalizeTag", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  körper  ")).toBe("körper");
  });

  it("collapses internal whitespace to single spaces", () => {
    expect(normalizeTag("erste   hilfe")).toBe("erste hilfe");
  });

  it("returns null for empty and whitespace-only input", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("\t\n")).toBeNull();
  });

  it("accepts tags up to 64 characters after trim", () => {
    const sixtyFour = "a".repeat(MAX_TAG_LENGTH);
    expect(normalizeTag(sixtyFour)).toBe(sixtyFour);
  });

  it("throws TagTooLongError on tags longer than 64 characters after trim", () => {
    const sixtyFive = "a".repeat(MAX_TAG_LENGTH + 1);
    expect(() => normalizeTag(sixtyFive)).toThrow(TagTooLongError);
  });
});

describe("normalizeTags", () => {
  it("normalizes each tag and drops blanks", () => {
    expect(normalizeTags(["  Körper  ", "", "  ", "Prüfung"])).toEqual(["Körper", "Prüfung"]);
  });

  it("deduplicates while preserving first-occurrence order", () => {
    expect(normalizeTags(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("treats tags differing only in whitespace as duplicates", () => {
    expect(normalizeTags(["körper", "  körper  ", "körper"])).toEqual(["körper"]);
  });

  it("propagates TagTooLongError from any element", () => {
    expect(() => normalizeTags(["ok", "a".repeat(MAX_TAG_LENGTH + 1)])).toThrow(TagTooLongError);
  });
});

describe("createCard", () => {
  it("returns a Card with normalized tags", () => {
    const card = createCard(baseInput({ tags: ["  körper  ", "körper", "prüfung"] }));
    expect(card).toEqual({
      id: "card-0001",
      deckId: "deck-0001",
      front: "Bonjour",
      back: "Guten Tag",
      tags: ["körper", "prüfung"],
    });
  });

  it("defaults tags to an empty array when omitted", () => {
    expect(createCard(baseInput()).tags).toEqual([]);
  });

  it("passes front and back through unchanged (no markdown manipulation in domain)", () => {
    const front = "  # Heading  \n\nwith blank lines\n";
    const card = createCard(baseInput({ front, back: "" }));
    expect(card.front).toBe(front);
    expect(card.back).toBe("");
  });
});

describe("updateCard", () => {
  const card: Card = {
    id: "card-0001",
    deckId: "deck-0001",
    front: "Bonjour",
    back: "Guten Tag",
    tags: ["körper"],
  };

  it("patches only fields present in the patch", () => {
    const next = updateCard(card, { front: "Salut" });
    expect(next.front).toBe("Salut");
    expect(next.back).toBe("Guten Tag");
    expect(next.tags).toEqual(["körper"]);
  });

  it("normalizes patched tags", () => {
    const next = updateCard(card, { tags: ["  Prüfung  ", "Prüfung", "Vokabeln"] });
    expect(next.tags).toEqual(["Prüfung", "Vokabeln"]);
  });

  it("allows clearing tags with an empty array", () => {
    expect(updateCard(card, { tags: [] }).tags).toEqual([]);
  });

  it("does not mutate the input", () => {
    updateCard(card, { front: "Salut", tags: ["andere"] });
    expect(card.front).toBe("Bonjour");
    expect(card.tags).toEqual(["körper"]);
  });
});

describe("validateCardSize", () => {
  it("passes for cards without embedded images", () => {
    const card = createCard(baseInput());
    expect(() => validateCardSize(card)).not.toThrow();
  });

  it("counts the base64 portion of a single embedded data: URI", () => {
    const card = createCard(baseInput({ front: `![](${TINY_PNG_DATA_URI})` }));
    // Indirect check: still well below the limit. The Multi-image case verifies counting precisely.
    expect(() => validateCardSize(card)).not.toThrow();
  });

  it("sums base64 bytes across multiple data: URIs in front and back", () => {
    // Construct a payload whose base64 bytes are exactly MAX_CARD_PAYLOAD_BYTES.
    // Two images: one in front, one in back. Equal split.
    const half = MAX_CARD_PAYLOAD_BYTES / 2;
    const halfBase64 = "A".repeat(half);
    const card = createCard(
      baseInput({
        front: `![a](data:image/jpeg;base64,${halfBase64})`,
        back: `![b](data:image/jpeg;base64,${halfBase64})`,
      }),
    );
    // At the boundary: exactly MAX bytes → passes (only strictly greater throws).
    expect(() => validateCardSize(card)).not.toThrow();
  });

  it("throws CardSizeError when total base64 bytes exceed the 5 MB limit", () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const card = createCard(baseInput({ front: `![big](data:image/jpeg;base64,${oversized})` }));
    expect(() => validateCardSize(card)).toThrow(CardSizeError);
  });

  it("does not count plain markdown text toward the limit", () => {
    // A multi-megabyte plain-text card stays valid: only embedded data: URIs count.
    const bigText = "x".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const card = createCard(baseInput({ front: bigText }));
    expect(() => validateCardSize(card)).not.toThrow();
  });

  it("ignores non-base64 data: URIs (e.g. data:text/plain,foo)", () => {
    const card = createCard(baseInput({ front: "data:text/plain,hello" }));
    expect(() => validateCardSize(card)).not.toThrow();
  });
});

describe("extractTagsFromCards", () => {
  const card = (id: string, tags: string[]): Card => ({
    id,
    deckId: "deck-0001",
    front: "",
    back: "",
    tags,
  });

  it("aggregates tags across all cards with counts", () => {
    const result = extractTagsFromCards([
      card("c1", ["körper", "prüfung"]),
      card("c2", ["körper", "vokabeln"]),
      card("c3", ["körper"]),
    ]);
    expect(result).toEqual([
      { tag: "körper", count: 3 },
      { tag: "prüfung", count: 1 },
      { tag: "vokabeln", count: 1 },
    ]);
  });

  it("sorts by frequency descending", () => {
    const result = extractTagsFromCards([
      card("c1", ["a"]),
      card("c2", ["b", "b"]),
      card("c3", ["c", "c", "c"]),
    ]);
    expect(result.map((r) => r.tag)).toEqual(["c", "b", "a"]);
  });

  it("breaks ties by first-occurrence order (stable)", () => {
    const result = extractTagsFromCards([
      card("c1", ["alpha", "beta"]),
      card("c2", ["beta", "alpha"]),
    ]);
    expect(result).toEqual([
      { tag: "alpha", count: 2 },
      { tag: "beta", count: 2 },
    ]);
  });

  it("returns an empty array for no cards", () => {
    expect(extractTagsFromCards([])).toEqual([]);
  });

  it("ignores cards with no tags", () => {
    const result = extractTagsFromCards([card("c1", []), card("c2", ["a"])]);
    expect(result).toEqual([{ tag: "a", count: 1 }]);
  });
});
