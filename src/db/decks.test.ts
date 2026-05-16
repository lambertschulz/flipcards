import "fake-indexeddb/auto";
import { db } from "@/db/database";
import { createDeckInDb, getDeck, listDecks, moveDeckToSetInDb, updateDeckInDb } from "@/db/decks";
import { InvalidDeckNameError } from "@/domain/deck";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("deck repository", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.decks.clear();
    await db.deckSets.clear();
  });

  it("persists a new deck and returns it via getDeck", async () => {
    const created = await createDeckInDb({ name: "  Latein  ", description: "Vokabeln" });
    expect(created.name).toBe("Latein");

    const fetched = await getDeck(created.id);
    expect(fetched).toEqual(created);
  });

  it("rejects creation when the name is blank", async () => {
    await expect(createDeckInDb({ name: "   " })).rejects.toBeInstanceOf(InvalidDeckNameError);
  });

  it("updates name and description in place", async () => {
    const created = await createDeckInDb({ name: "Latein" });
    const updated = await updateDeckInDb(created.id, {
      name: "Latein I",
      description: "Anfänger",
    });
    expect(updated.name).toBe("Latein I");
    expect(updated.description).toBe("Anfänger");

    const fetched = await getDeck(created.id);
    expect(fetched?.description).toBe("Anfänger");
  });

  it("moves a deck into and out of a deck-set", async () => {
    const created = await createDeckInDb({ name: "Anatomie", deckSetId: "ds1" });
    expect((await getDeck(created.id))?.deckSetId).toBe("ds1");

    await moveDeckToSetInDb(created.id, "ds2");
    expect((await getDeck(created.id))?.deckSetId).toBe("ds2");

    await moveDeckToSetInDb(created.id, null);
    expect((await getDeck(created.id))?.deckSetId).toBeUndefined();
  });

  it("lists decks sorted by name", async () => {
    await createDeckInDb({ name: "Zoo" });
    await createDeckInDb({ name: "Apfel" });
    const list = await listDecks();
    expect(list.map((d) => d.name)).toEqual(["Apfel", "Zoo"]);
  });

  it("allows two decks with the same name (collision-tolerant per ADR-0011)", async () => {
    const a = await createDeckInDb({ name: "Vokabeln" });
    const b = await createDeckInDb({ name: "Vokabeln" });
    expect(a.id).not.toBe(b.id);
    const list = await listDecks();
    expect(list.filter((d) => d.name === "Vokabeln")).toHaveLength(2);
  });
});
