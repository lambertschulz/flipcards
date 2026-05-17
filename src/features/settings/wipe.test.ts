import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { wipeAllData } from "@/features/settings/wipe";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    __resetPendingDeletesForTests();
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

  it("drains the pending-delete coordinator before wiping (round-4)", async () => {
    // ADR-0014 class (b): destructive bulk-replace paths must call
    // `cancelAll()` before mutating the DB so deferred deletes cannot
    // fire after the wipe and run their (now-stale) commit thunks.
    await db.deckSets.add({ id: "set-1", name: "S" });
    const deck = await createDeckInDb({ name: "D", deckSetId: "set-1" });
    const card = await createCardInDb({ deckId: deck.id, front: "f", back: "b" });

    const store = getPendingDeletes();
    const commit = vi.fn().mockResolvedValue(undefined);
    store.enqueue({
      key: `card:${card.id}`,
      label: "Card gelöscht",
      commit,
      restore: async () => {},
    });
    expect(store.list()).toHaveLength(1);

    await wipeAllData();

    // Pending op must have been discarded — commit thunk never fired,
    // coordinator is empty.
    expect(commit).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
    expect(store.isPending(`card:${card.id}`)).toBe(false);

    // DB is empty (the wipe ran).
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
});
