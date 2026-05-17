import type { Deck } from "@/domain/deck";
import {
  type DeckSet,
  InvalidDeckSetNameError,
  addDeckToSet,
  createDeckSet,
  isValidDeckSetName,
  normalizeDeckSetName,
  removeDeckFromSet,
  updateDeckSet,
} from "@/domain/deck-set";
import { describe, expect, it } from "vitest";

const baseSet = (overrides: Partial<DeckSet> = {}): DeckSet => ({
  id: "ds1",
  name: "Medizin 1. Semester",
  ...overrides,
});

const baseDeck = (overrides: Partial<Deck> = {}): Deck => ({
  id: "d1",
  name: "Anatomie",
  ...overrides,
});

describe("normalizeDeckSetName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeDeckSetName("  Medizin  ")).toBe("Medizin");
  });
});

describe("isValidDeckSetName", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(isValidDeckSetName("")).toBe(false);
    expect(isValidDeckSetName("   ")).toBe(false);
  });

  it("accepts any non-empty trimmed name", () => {
    expect(isValidDeckSetName("a")).toBe(true);
    expect(isValidDeckSetName("  Medizin  ")).toBe(true);
  });
});

describe("createDeckSet", () => {
  it("returns a DeckSet with trimmed name and optional description", () => {
    const set = createDeckSet({
      id: "ds1",
      name: "  Medizin  ",
      description: "  1. Semester  ",
    });
    expect(set).toEqual({
      id: "ds1",
      name: "Medizin",
      description: "1. Semester",
    });
  });

  it("omits description when blank after trim", () => {
    const set = createDeckSet({ id: "ds1", name: "Medizin", description: "   " });
    expect(set.description).toBeUndefined();
  });

  it("omits description when not provided", () => {
    const set = createDeckSet({ id: "ds1", name: "Medizin" });
    expect(set.description).toBeUndefined();
  });

  it("throws InvalidDeckSetNameError when name is empty after trim", () => {
    expect(() => createDeckSet({ id: "ds1", name: "   " })).toThrow(InvalidDeckSetNameError);
  });
});

describe("updateDeckSet", () => {
  it("updates only fields present in the patch", () => {
    const set = baseSet({ description: "alt" });
    const next = updateDeckSet(set, { name: "  Neu  " });
    expect(next.name).toBe("Neu");
    expect(next.description).toBe("alt");
  });

  it("normalizes the new name", () => {
    const next = updateDeckSet(baseSet(), { name: "  Medizin  " });
    expect(next.name).toBe("Medizin");
  });

  it("clears description when patched with blank string", () => {
    const set = baseSet({ description: "alt" });
    const next = updateDeckSet(set, { description: "   " });
    expect(next.description).toBeUndefined();
  });

  it("throws when patched name is empty after trim", () => {
    expect(() => updateDeckSet(baseSet(), { name: "  " })).toThrow(InvalidDeckSetNameError);
  });

  it("does not mutate the input", () => {
    const set = baseSet();
    updateDeckSet(set, { name: "Andere" });
    expect(set.name).toBe("Medizin 1. Semester");
  });
});

describe("addDeckToSet", () => {
  it("assigns the deck-set id to a lose deck", () => {
    const deck = baseDeck();
    const next = addDeckToSet(deck, "ds1");
    expect(next.deckSetId).toBe("ds1");
  });

  it("overwrites an existing deck-set id (deck moves between sets — ADR-0003)", () => {
    const deck = baseDeck({ deckSetId: "ds-old" });
    const next = addDeckToSet(deck, "ds-new");
    expect(next.deckSetId).toBe("ds-new");
  });

  it("does not mutate the input", () => {
    const deck = baseDeck();
    addDeckToSet(deck, "ds1");
    expect(deck.deckSetId).toBeUndefined();
  });
});

describe("removeDeckFromSet", () => {
  it("clears the deck-set id (deck becomes lose)", () => {
    const deck = baseDeck({ deckSetId: "ds1" });
    const next = removeDeckFromSet(deck);
    expect(next.deckSetId).toBeUndefined();
  });

  it("is a no-op for an already-lose deck", () => {
    const deck = baseDeck();
    const next = removeDeckFromSet(deck);
    expect(next.deckSetId).toBeUndefined();
    expect(next).toEqual(deck);
  });

  it("does not mutate the input", () => {
    const deck = baseDeck({ deckSetId: "ds1" });
    removeDeckFromSet(deck);
    expect(deck.deckSetId).toBe("ds1");
  });

  it("preserves all other deck fields", () => {
    const deck = baseDeck({ deckSetId: "ds1", description: "Vokabeln" });
    const next = removeDeckFromSet(deck);
    expect(next).toEqual({ id: "d1", name: "Anatomie", description: "Vokabeln" });
  });
});
