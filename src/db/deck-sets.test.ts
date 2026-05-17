import "fake-indexeddb/auto";
import { db } from "@/db/database";
import {
  addDeckToSetInDb,
  createDeckSetInDb,
  getDeckSet,
  listDeckSets,
  listDecksInSet,
  listLoseDecks,
  removeDeckFromSetInDb,
  updateDeckSetInDb,
} from "@/db/deck-sets";
import { createDeckInDb } from "@/db/decks";
import { InvalidDeckSetNameError } from "@/domain/deck-set";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("deck-set repository", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.decks.clear();
    await db.deckSets.clear();
  });

  it("persists a new deck-set and returns it via getDeckSet", async () => {
    const created = await createDeckSetInDb({ name: "  Medizin  ", description: "1. Semester" });
    expect(created.name).toBe("Medizin");
    expect(created.description).toBe("1. Semester");

    const fetched = await getDeckSet(created.id);
    expect(fetched).toEqual(created);
  });

  it("creates without description when omitted or blank", async () => {
    const a = await createDeckSetInDb({ name: "Medizin" });
    expect(a.description).toBeUndefined();
    const b = await createDeckSetInDb({ name: "Jura", description: "   " });
    expect(b.description).toBeUndefined();
  });

  it("rejects creation when the name is blank", async () => {
    await expect(createDeckSetInDb({ name: "   " })).rejects.toBeInstanceOf(
      InvalidDeckSetNameError,
    );
  });

  it("updates name and description in place", async () => {
    const created = await createDeckSetInDb({ name: "Medizin" });
    const updated = await updateDeckSetInDb(created.id, {
      name: "Medizin 1. Semester",
      description: "Anatomie + Physio",
    });
    expect(updated.name).toBe("Medizin 1. Semester");
    expect(updated.description).toBe("Anatomie + Physio");

    const fetched = await getDeckSet(created.id);
    expect(fetched?.description).toBe("Anatomie + Physio");
  });

  it("clears description when patched with blank string", async () => {
    const created = await createDeckSetInDb({ name: "Medizin", description: "alt" });
    const updated = await updateDeckSetInDb(created.id, { description: "  " });
    expect(updated.description).toBeUndefined();
    const fetched = await getDeckSet(created.id);
    expect(fetched?.description).toBeUndefined();
  });

  it("lists deck-sets sorted by name", async () => {
    await createDeckSetInDb({ name: "Zoo" });
    await createDeckSetInDb({ name: "Apfel" });
    const list = await listDeckSets();
    expect(list.map((s) => s.name)).toEqual(["Apfel", "Zoo"]);
  });

  describe("addDeckToSetInDb", () => {
    it("assigns a lose deck to a set", async () => {
      const set = await createDeckSetInDb({ name: "Medizin" });
      const deck = await createDeckInDb({ name: "Anatomie" });
      await addDeckToSetInDb(deck.id, set.id);

      const inSet = await listDecksInSet(set.id);
      expect(inSet.map((d) => d.id)).toEqual([deck.id]);
    });

    it("moves a deck between sets (ADR-0003 — at most one set)", async () => {
      const setA = await createDeckSetInDb({ name: "Medizin" });
      const setB = await createDeckSetInDb({ name: "Jura" });
      const deck = await createDeckInDb({ name: "Anatomie", deckSetId: setA.id });

      await addDeckToSetInDb(deck.id, setB.id);

      expect(await listDecksInSet(setA.id)).toEqual([]);
      expect((await listDecksInSet(setB.id)).map((d) => d.id)).toEqual([deck.id]);
    });

    it("throws when the deck does not exist", async () => {
      const set = await createDeckSetInDb({ name: "Medizin" });
      await expect(addDeckToSetInDb("nope", set.id)).rejects.toThrow(/Deck not found/);
    });

    it("throws when the deck-set does not exist", async () => {
      const deck = await createDeckInDb({ name: "Anatomie" });
      await expect(addDeckToSetInDb(deck.id, "nope")).rejects.toThrow(/Deck-Set not found/);
    });
  });

  describe("removeDeckFromSetInDb", () => {
    it("makes a set-member deck lose", async () => {
      const set = await createDeckSetInDb({ name: "Medizin" });
      const deck = await createDeckInDb({ name: "Anatomie", deckSetId: set.id });

      await removeDeckFromSetInDb(deck.id);

      expect(await listDecksInSet(set.id)).toEqual([]);
      const lose = await listLoseDecks();
      expect(lose.map((d) => d.id)).toContain(deck.id);
    });

    it("leaves the deck-set in place even when it becomes empty (ADR-0014)", async () => {
      const set = await createDeckSetInDb({ name: "Medizin" });
      const deck = await createDeckInDb({ name: "Anatomie", deckSetId: set.id });

      await removeDeckFromSetInDb(deck.id);

      const stillThere = await getDeckSet(set.id);
      expect(stillThere?.id).toBe(set.id);
    });

    it("is idempotent for an already-lose deck", async () => {
      const deck = await createDeckInDb({ name: "Anatomie" });
      await removeDeckFromSetInDb(deck.id);
      const lose = await listLoseDecks();
      expect(lose.map((d) => d.id)).toContain(deck.id);
    });
  });

  describe("listLoseDecks", () => {
    it("returns decks without a deck-set, sorted by name", async () => {
      const set = await createDeckSetInDb({ name: "Medizin" });
      await createDeckInDb({ name: "Zoo" });
      await createDeckInDb({ name: "Apfel" });
      await createDeckInDb({ name: "InSet", deckSetId: set.id });

      const lose = await listLoseDecks();
      expect(lose.map((d) => d.name)).toEqual(["Apfel", "Zoo"]);
    });
  });
});
