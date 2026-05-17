import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import {
  getReviewState,
  listAllDueCards,
  listDueCardsInDeck,
  putReviewState,
} from "@/db/review-states";
import { INITIAL_REVIEW_STATE, type ReviewState } from "@/domain/sm2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("review-state repository", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.reviewStates.clear();
  });

  it("returns INITIAL_REVIEW_STATE when no row exists yet", async () => {
    const state = await getReviewState("missing-card");
    expect(state).toEqual(INITIAL_REVIEW_STATE);
  });

  it("round-trips a stored SM-2 state", async () => {
    const card = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    const stored: ReviewState = {
      repetitions: 3,
      easeFactor: 2.4,
      intervalDays: 10,
      nextDue: 1234567890,
    };
    await putReviewState(card.id, stored);
    expect(await getReviewState(card.id)).toEqual(stored);
  });

  it("treats fresh cards (no review-state row) as due", async () => {
    const now = Date.now();
    const card = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    const due = await listDueCardsInDeck("deck-1", now);
    expect(due.map((c) => c.id)).toEqual([card.id]);
  });

  it("excludes cards whose nextDue is in the future", async () => {
    const now = Date.now();
    const card = await createCardInDb({ deckId: "deck-1", front: "a", back: "b" });
    await putReviewState(card.id, {
      ...INITIAL_REVIEW_STATE,
      nextDue: now + DAY_MS,
    });
    expect(await listDueCardsInDeck("deck-1", now)).toEqual([]);
  });

  it("only returns cards from the requested deck", async () => {
    const now = Date.now();
    const a = await createCardInDb({ deckId: "deck-1", front: "a", back: "a" });
    await createCardInDb({ deckId: "deck-2", front: "b", back: "b" });
    const due = await listDueCardsInDeck("deck-1", now);
    expect(due.map((c) => c.id)).toEqual([a.id]);
  });

  it("listAllDueCards returns due cards across all decks", async () => {
    const now = Date.now();
    const a = await createCardInDb({ deckId: "deck-1", front: "a", back: "a", tags: ["x"] });
    const b = await createCardInDb({ deckId: "deck-2", front: "b", back: "b", tags: ["y"] });
    const future = await createCardInDb({ deckId: "deck-2", front: "c", back: "c" });
    await putReviewState(future.id, { ...INITIAL_REVIEW_STATE, nextDue: now + DAY_MS });

    const due = await listAllDueCards(now);
    const ids = due.map((c) => c.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
    // Tags travel through unchanged — picker needs them.
    const byId = new Map(due.map((c) => [c.id, c]));
    expect(byId.get(a.id)?.tags).toEqual(["x"]);
    expect(byId.get(b.id)?.tags).toEqual(["y"]);
  });
});
