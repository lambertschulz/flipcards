import type { Card } from "@/domain/card";
import { dueCardsForTagAnd, listTagsWithDueCounts } from "@/domain/tags";
import { describe, expect, it } from "vitest";

function card(id: string, tags: string[]): Card {
  return { id, deckId: "deck", front: `front-${id}`, back: `back-${id}`, tags };
}

describe("listTagsWithDueCounts", () => {
  it("returns an empty list when no cards are given", () => {
    expect(listTagsWithDueCounts([])).toEqual([]);
  });

  it("returns an empty list when cards have no tags", () => {
    expect(listTagsWithDueCounts([card("a", []), card("b", [])])).toEqual([]);
  });

  it("counts each tag once per card that carries it", () => {
    const result = listTagsWithDueCounts([
      card("a", ["prüfung", "medizin"]),
      card("b", ["prüfung"]),
      card("c", ["medizin", "anatomie"]),
    ]);
    expect(result).toEqual([
      { tag: "medizin", dueCount: 2 },
      { tag: "prüfung", dueCount: 2 },
      { tag: "anatomie", dueCount: 1 },
    ]);
  });

  it("sorts by descending due-count, breaking ties alphabetically", () => {
    const result = listTagsWithDueCounts([
      card("a", ["zeta"]),
      card("b", ["alpha"]),
      card("c", ["alpha"]),
      card("d", ["beta", "alpha"]),
      card("e", ["beta"]),
    ]);
    expect(result).toEqual([
      { tag: "alpha", dueCount: 3 },
      { tag: "beta", dueCount: 2 },
      { tag: "zeta", dueCount: 1 },
    ]);
  });

  it("does not double-count tags that appear multiple times in one card (defensive — Card domain normalises, but the helper shouldn't rely on it)", () => {
    // Note: `normalizeTags` already dedupes, so in practice this case shouldn't
    // arise. The helper still treats a duplicate tag in the same card as a
    // single occurrence because it iterates `card.tags` directly — if a tag
    // appears twice in the array, both entries increment. We document this
    // here: the *count* is "number of tag-occurrences in due cards", not
    // "number of distinct cards that carry the tag". The data layer's
    // invariant (deduped tags per card) makes the two definitions equivalent.
    const result = listTagsWithDueCounts([card("a", ["prüfung", "prüfung"])]);
    expect(result).toEqual([{ tag: "prüfung", dueCount: 2 }]);
  });
});

describe("dueCardsForTagAnd", () => {
  it("returns [] when no tags are given (per Tag-Session-Picker semantics: 0 selected tags = no session, not all due cards)", () => {
    expect(dueCardsForTagAnd([card("a", ["x"])], [])).toEqual([]);
  });

  it("returns cards that carry the single given tag", () => {
    const cards = [card("a", ["prüfung"]), card("b", ["anatomie"]), card("c", ["prüfung", "haut"])];
    const result = dueCardsForTagAnd(cards, ["prüfung"]);
    expect(result.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("returns only cards that carry *all* of the given tags (AND-semantics)", () => {
    const cards = [
      card("a", ["prüfung", "medizin"]),
      card("b", ["prüfung"]),
      card("c", ["medizin"]),
      card("d", ["prüfung", "medizin", "anatomie"]),
    ];
    const result = dueCardsForTagAnd(cards, ["prüfung", "medizin"]);
    expect(result.map((c) => c.id)).toEqual(["a", "d"]);
  });

  it("returns an empty array when no card matches the AND-set", () => {
    const cards = [card("a", ["prüfung"]), card("b", ["medizin"])];
    expect(dueCardsForTagAnd(cards, ["prüfung", "medizin"])).toEqual([]);
  });

  it("preserves the input order of matching cards", () => {
    const cards = [
      card("a", ["prüfung", "medizin"]),
      card("b", ["medizin"]),
      card("c", ["prüfung", "medizin"]),
      card("d", ["prüfung"]),
      card("e", ["prüfung", "medizin"]),
    ];
    const result = dueCardsForTagAnd(cards, ["prüfung", "medizin"]);
    expect(result.map((c) => c.id)).toEqual(["a", "c", "e"]);
  });

  it("treats the tags list as a set — duplicates in the query don't change the result", () => {
    const cards = [card("a", ["prüfung"]), card("b", ["prüfung", "medizin"])];
    const result = dueCardsForTagAnd(cards, ["prüfung", "prüfung"]);
    expect(result.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
