import "fake-indexeddb/auto";
import {
  createCardInDb,
  deleteCard,
  getCard,
  listAllCards,
  listCardsInDeck,
  updateCardInDb,
} from "@/db/cards";
import { db } from "@/db/database";
import { CardSizeError, MAX_CARD_PAYLOAD_BYTES } from "@/domain/card";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("card repository", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
  });

  it("creates a card with normalized tags and returns it via getCard", async () => {
    const created = await createCardInDb({
      deckId: "deck-1",
      front: "Bonjour",
      back: "Guten Tag",
      tags: ["  vokabeln  ", "vokabeln", "französisch"],
    });
    expect(created.tags).toEqual(["vokabeln", "französisch"]);

    const fetched = await getCard(created.id);
    expect(fetched).toEqual(created);
  });

  it("rejects creation when the card payload exceeds 5 MB", async () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    await expect(
      createCardInDb({
        deckId: "deck-1",
        front: `![big](data:image/jpeg;base64,${oversized})`,
        back: "",
      }),
    ).rejects.toBeInstanceOf(CardSizeError);
  });

  it("updates front/back/tags in place and re-validates size", async () => {
    const created = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    const updated = await updateCardInDb(created.id, {
      front: "front-2",
      tags: ["körper"],
    });
    expect(updated.front).toBe("front-2");
    expect(updated.back).toBe("b");
    expect(updated.tags).toEqual(["körper"]);

    const fetched = await getCard(created.id);
    expect(fetched).toEqual(updated);
  });

  it("rejects an update that would push the card over 5 MB", async () => {
    const created = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    await expect(
      updateCardInDb(created.id, { front: `![](data:image/jpeg;base64,${oversized})` }),
    ).rejects.toBeInstanceOf(CardSizeError);
  });

  it("lists only cards in the requested deck", async () => {
    await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    await createCardInDb({ deckId: "deck-2", front: "c", back: "d" });
    await createCardInDb({ deckId: "deck-1", front: "e", back: "f" });

    const deckOne = await listCardsInDeck("deck-1");
    expect(deckOne.map((c) => c.front).sort()).toEqual(["a", "e"]);
  });

  it("lists all cards across decks for tag-aggregation use-cases", async () => {
    await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    await createCardInDb({ deckId: "deck-2", front: "c", back: "d" });
    expect(await listAllCards()).toHaveLength(2);
  });

  it("deletes a card by id", async () => {
    const created = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    await deleteCard(created.id);
    expect(await getCard(created.id)).toBeUndefined();
  });
});
