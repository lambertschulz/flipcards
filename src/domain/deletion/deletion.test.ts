import {
  type CardLite,
  type DeckLite,
  planDeleteCard,
  planDeleteDeck,
  planDeleteDeckSet,
} from "@/domain/deletion";
import { describe, expect, it } from "vitest";

describe("planDeleteCard", () => {
  it("returns the card-id plus its review-state id (1:1)", () => {
    const plan = planDeleteCard("c1");
    expect(plan).toEqual({ kind: "card", cardId: "c1", reviewStateCardIds: ["c1"] });
  });
});

describe("planDeleteDeck", () => {
  const cards: CardLite[] = [
    { id: "c1", deckId: "d1" },
    { id: "c2", deckId: "d1" },
    { id: "c3", deckId: "d2" },
  ];

  it("collects only cards in the target deck", () => {
    const plan = planDeleteDeck("d1", cards);
    expect(plan.kind).toBe("deck");
    expect(plan.deckId).toBe("d1");
    expect(plan.cardIds).toEqual(["c1", "c2"]);
  });

  it("emits a review-state id per affected card (cascade)", () => {
    const plan = planDeleteDeck("d1", cards);
    expect(plan.reviewStateCardIds).toEqual(plan.cardIds);
  });

  it("returns empty card arrays for an empty deck", () => {
    const plan = planDeleteDeck("d-empty", cards);
    expect(plan.cardIds).toEqual([]);
    expect(plan.reviewStateCardIds).toEqual([]);
  });
});

describe("planDeleteDeckSet", () => {
  const decks: DeckLite[] = [
    { id: "d1", deckSetId: "s1" },
    { id: "d2", deckSetId: "s1" },
    { id: "d3", deckSetId: "s2" },
    { id: "d4" },
  ];

  it("detaches every member deck of the set (decks fall out, stay alive)", () => {
    const plan = planDeleteDeckSet("s1", decks);
    expect(plan.kind).toBe("deck-set");
    expect(plan.deckSetId).toBe("s1");
    expect(plan.detachedDeckIds).toEqual(["d1", "d2"]);
  });

  it("returns an empty detached list for an empty set (empty deck-sets exist per ADR-0014)", () => {
    const plan = planDeleteDeckSet("s-empty", decks);
    expect(plan.detachedDeckIds).toEqual([]);
  });

  it("never touches lose decks or decks in other sets", () => {
    const plan = planDeleteDeckSet("s1", decks);
    expect(plan.detachedDeckIds).not.toContain("d3");
    expect(plan.detachedDeckIds).not.toContain("d4");
  });
});
