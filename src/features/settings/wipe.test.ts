import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { wipeAllData } from "@/features/settings/wipe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("wipeAllData", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.decks.clear();
    await db.deckSets.clear();
    await db.cards.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("empties every user-data table", async () => {
    await db.deckSets.add({ id: "set-1", name: "S" });
    const deck = await createDeckInDb({ name: "D", deckSetId: "set-1" });
    const card = await createCardInDb({ deckId: deck.id, front: "f", back: "b" });
    await putReviewState(card.id, { ...INITIAL_REVIEW_STATE, nextDue: 1 });

    await wipeAllData();

    expect(await db.decks.count()).toBe(0);
    expect(await db.deckSets.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewStates.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });
});
