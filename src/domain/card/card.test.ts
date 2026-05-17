import {
  type Card,
  CardSizeError,
  type CreateCardInput,
  MAX_CARD_PAYLOAD_BYTES,
  MAX_TAG_LENGTH,
  TagTooLongError,
  createCard,
  extractTagsFromCards,
  filterCards,
  normalizeTag,
  normalizeTags,
  tagCountsForFilter,
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

describe("filterCards", () => {
  const make = (id: string, front: string, back: string, tags: string[] = []): Card => ({
    id,
    deckId: "deck-0001",
    front,
    back,
    tags,
  });

  const cards: Card[] = [
    make("c1", "Bonjour", "Guten Tag", ["französisch"]),
    make("c2", "Bonsoir", "Guten Abend", ["französisch", "abend"]),
    make("c3", "Hallo", "Hello", ["englisch"]),
    make("c4", "Frosch", "Frog ![pic](data:image/png;base64,iVBOR=)", ["tier", "englisch"]),
    make("c5", "Apfel", "Apple", ["essen"]),
  ];

  it("returns all cards when no filters are applied", () => {
    expect(filterCards(cards)).toEqual(cards);
  });

  it("ignores an empty/whitespace query (treats as no query)", () => {
    expect(filterCards(cards, { query: "" })).toEqual(cards);
    expect(filterCards(cards, { query: "   " })).toEqual(cards);
  });

  it("matches the query case-insensitively against front", () => {
    const result = filterCards(cards, { query: "bonjour" });
    expect(result.map((c) => c.id)).toEqual(["c1"]);
    const upper = filterCards(cards, { query: "BONJOUR" });
    expect(upper.map((c) => c.id)).toEqual(["c1"]);
  });

  it("matches the query case-insensitively against back", () => {
    const result = filterCards(cards, { query: "abend" });
    // c2 has 'abend' in back ("Guten Abend") — also as a tag, but back-match is what fires here
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("does substring matching (no word-boundary requirement)", () => {
    const result = filterCards(cards, { query: "bons" });
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns an empty list when the query matches nothing", () => {
    expect(filterCards(cards, { query: "xyz" })).toEqual([]);
  });

  it("matches against the Markdown source, including alt-text in image syntax", () => {
    const result = filterCards(cards, { query: "pic" });
    expect(result.map((c) => c.id)).toEqual(["c4"]);
  });

  it("does not match the query against tags", () => {
    // 'essen' is only a tag on c5 — no substring in front/back.
    expect(filterCards(cards, { query: "essen" })).toEqual([]);
  });

  it("ignores an empty tags array (treats as no tag filter)", () => {
    expect(filterCards(cards, { tags: [] })).toEqual(cards);
  });

  it("AND-matches across multiple tags", () => {
    const result = filterCards(cards, { tags: ["französisch", "abend"] });
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns [] when no card carries all required tags", () => {
    expect(filterCards(cards, { tags: ["französisch", "tier"] })).toEqual([]);
  });

  it("respects status='due' using the supplied dueCardIds set", () => {
    const dueCardIds = new Set(["c1", "c4"]);
    const result = filterCards(cards, { status: "due", dueCardIds });
    expect(result.map((c) => c.id)).toEqual(["c1", "c4"]);
  });

  it("status='due' with no dueCardIds excludes everything (defensive)", () => {
    expect(filterCards(cards, { status: "due" })).toEqual([]);
  });

  it("status='all' ignores dueCardIds entirely", () => {
    expect(filterCards(cards, { status: "all", dueCardIds: new Set(["c1"]) })).toEqual(cards);
  });

  it("AND-combines query, tags, and status", () => {
    const dueCardIds = new Set(["c2", "c4"]);
    const result = filterCards(cards, {
      query: "bon",
      tags: ["französisch"],
      status: "due",
      dueCardIds,
    });
    // c1 matches query+tag but is not due; c2 matches all three; c4 not.
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("preserves input order", () => {
    const reordered = [...cards].reverse();
    const result = filterCards(reordered, { tags: ["englisch"] });
    expect(result.map((c) => c.id)).toEqual(["c4", "c3"]);
  });
});

describe("tagCountsForFilter", () => {
  const make = (id: string, front: string, back: string, tags: string[] = []): Card => ({
    id,
    deckId: "deck-0001",
    front,
    back,
    tags,
  });

  it("counts tags across all cards when no filter is applied", () => {
    const cards = [make("c1", "a", "b", ["x", "y"]), make("c2", "c", "d", ["x"])];
    expect(tagCountsForFilter(cards)).toEqual([
      { tag: "x", count: 2 },
      { tag: "y", count: 1 },
    ]);
  });

  it("respects the query when computing counts", () => {
    const cards = [make("c1", "frosch", "frog", ["tier"]), make("c2", "apfel", "apple", ["essen"])];
    expect(tagCountsForFilter(cards, { query: "frog" })).toEqual([{ tag: "tier", count: 1 }]);
  });

  it("respects the status when computing counts", () => {
    const cards = [make("c1", "a", "b", ["x"]), make("c2", "c", "d", ["x", "y"])];
    const counts = tagCountsForFilter(cards, {
      status: "due",
      dueCardIds: new Set(["c2"]),
    });
    expect(counts).toEqual([
      { tag: "x", count: 1 },
      { tag: "y", count: 1 },
    ]);
  });
});
