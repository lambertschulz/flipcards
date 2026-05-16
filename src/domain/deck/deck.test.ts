import {
  type Deck,
  InvalidDeckNameError,
  createDeck,
  isValidDeckName,
  moveDeckToSet,
  normalizeDeckName,
  updateDeck,
} from "@/domain/deck";
import { describe, expect, it } from "vitest";

const baseDeck = (overrides: Partial<Deck> = {}): Deck => ({
  id: "d1",
  name: "Französisch-Vokabeln",
  ...overrides,
});

describe("normalizeDeckName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeDeckName("  Latein  ")).toBe("Latein");
  });
});

describe("isValidDeckName", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(isValidDeckName("")).toBe(false);
    expect(isValidDeckName("   ")).toBe(false);
  });

  it("accepts any non-empty trimmed name", () => {
    expect(isValidDeckName("a")).toBe(true);
    expect(isValidDeckName("  Latein  ")).toBe(true);
  });
});

describe("createDeck", () => {
  it("returns a Deck with trimmed name and optional fields", () => {
    const deck = createDeck({
      id: "d1",
      name: "  Französisch  ",
      description: "  Vokabeln A1  ",
      deckSetId: "ds1",
    });
    expect(deck).toEqual({
      id: "d1",
      name: "Französisch",
      description: "Vokabeln A1",
      deckSetId: "ds1",
    });
  });

  it("omits description when blank after trim", () => {
    const deck = createDeck({ id: "d1", name: "Latein", description: "   " });
    expect(deck.description).toBeUndefined();
  });

  it("omits deckSetId when not provided", () => {
    const deck = createDeck({ id: "d1", name: "Latein" });
    expect(deck.deckSetId).toBeUndefined();
  });

  it("throws InvalidDeckNameError when name is empty after trim", () => {
    expect(() => createDeck({ id: "d1", name: "   " })).toThrow(InvalidDeckNameError);
  });

  it("allows duplicate names within the same set (collision-tolerant per ADR-0011)", () => {
    const a = createDeck({ id: "d1", name: "Vokabeln", deckSetId: "ds1" });
    const b = createDeck({ id: "d2", name: "Vokabeln", deckSetId: "ds1" });
    expect(a.name).toBe(b.name);
  });
});

describe("updateDeck", () => {
  it("updates only fields present in the patch", () => {
    const deck = baseDeck({ description: "alt" });
    const next = updateDeck(deck, { name: "  Neu  " });
    expect(next.name).toBe("Neu");
    expect(next.description).toBe("alt");
  });

  it("normalizes the new name", () => {
    const next = updateDeck(baseDeck(), { name: "  Latein  " });
    expect(next.name).toBe("Latein");
  });

  it("clears description when patched with blank string", () => {
    const deck = baseDeck({ description: "alt" });
    const next = updateDeck(deck, { description: "   " });
    expect(next.description).toBeUndefined();
  });

  it("throws when patched name is empty after trim", () => {
    expect(() => updateDeck(baseDeck(), { name: "  " })).toThrow(InvalidDeckNameError);
  });

  it("does not mutate the input", () => {
    const deck = baseDeck();
    updateDeck(deck, { name: "Andere" });
    expect(deck.name).toBe("Französisch-Vokabeln");
  });
});

describe("moveDeckToSet", () => {
  it("assigns a deck-set id", () => {
    const deck = baseDeck();
    expect(moveDeckToSet(deck, "ds1").deckSetId).toBe("ds1");
  });

  it("clears the deck-set id when given null (deck becomes lose)", () => {
    const deck = baseDeck({ deckSetId: "ds1" });
    expect(moveDeckToSet(deck, null).deckSetId).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const deck = baseDeck({ deckSetId: "ds1" });
    moveDeckToSet(deck, null);
    expect(deck.deckSetId).toBe("ds1");
  });
});
