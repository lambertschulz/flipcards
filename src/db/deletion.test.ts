import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import {
  deleteCardWithCascade,
  deleteDeckSetWithCascade,
  deleteDeckWithCascade,
  restoreDeletedCard,
  restoreDeletedDeck,
  restoreDeletedDeckSet,
} from "@/db/deletion";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function reset() {
  await db.cards.clear();
  await db.decks.clear();
  await db.deckSets.clear();
  await db.reviewStates.clear();
  await db.reviews.clear();
}

describe("deleteCardWithCascade", () => {
  beforeEach(async () => {
    await db.open();
    await reset();
  });
  afterEach(reset);

  it("removes the card and its review-state in one transaction", async () => {
    const card = await createCardInDb({ deckId: "d1", front: "a", back: "b" });
    await putReviewState(card.id, { ...INITIAL_REVIEW_STATE, nextDue: 0 });

    const snap = await deleteCardWithCascade(card.id);
    expect(snap.card.id).toBe(card.id);
    expect(snap.reviewState?.cardId).toBe(card.id);

    expect(await db.cards.get(card.id)).toBeUndefined();
    expect(await db.reviewStates.get(card.id)).toBeUndefined();
  });

  it("is a no-op snapshot when the card is already gone", async () => {
    const snap = await deleteCardWithCascade("does-not-exist");
    expect(snap.card.id).toBe("does-not-exist");
    expect(snap.reviewState).toBeUndefined();
  });

  it("restores both card and review-state from the snapshot", async () => {
    const card = await createCardInDb({
      deckId: "d1",
      front: "front",
      back: "back",
      tags: ["foo"],
    });
    await putReviewState(card.id, { ...INITIAL_REVIEW_STATE, repetitions: 3, nextDue: 1234 });

    const snap = await deleteCardWithCascade(card.id);
    await restoreDeletedCard(snap);

    const restored = await db.cards.get(card.id);
    const state = await db.reviewStates.get(card.id);
    expect(restored).toBeDefined();
    expect(restored?.tags).toEqual(["foo"]);
    expect(state?.repetitions).toBe(3);
    expect(state?.nextDue).toBe(1234);
  });
});

describe("deleteDeckWithCascade", () => {
  beforeEach(async () => {
    await db.open();
    await reset();
  });
  afterEach(reset);

  it("removes the deck, all its cards, and their review-states", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    const c1 = await createCardInDb({ deckId: deck.id, front: "a", back: "b" });
    const c2 = await createCardInDb({ deckId: deck.id, front: "c", back: "d" });
    await putReviewState(c1.id, { ...INITIAL_REVIEW_STATE });
    await putReviewState(c2.id, { ...INITIAL_REVIEW_STATE });

    // Bystander card in another deck — must NOT be touched.
    const otherDeck = await createDeckInDb({ name: "Französisch" });
    const cOther = await createCardInDb({ deckId: otherDeck.id, front: "x", back: "y" });
    await putReviewState(cOther.id, { ...INITIAL_REVIEW_STATE });

    const snap = await deleteDeckWithCascade(deck.id);
    expect(snap.deck.id).toBe(deck.id);
    expect(snap.cards.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    expect(snap.reviewStates).toHaveLength(2);

    expect(await db.decks.get(deck.id)).toBeUndefined();
    expect(await db.cards.where("deckId").equals(deck.id).count()).toBe(0);
    expect(await db.reviewStates.get(c1.id)).toBeUndefined();
    expect(await db.reviewStates.get(c2.id)).toBeUndefined();

    // Bystander deck + card untouched.
    expect(await db.decks.get(otherDeck.id)).toBeDefined();
    expect(await db.cards.get(cOther.id)).toBeDefined();
    expect(await db.reviewStates.get(cOther.id)).toBeDefined();
  });

  it("leaves no orphan cards after the cascade (read happens inside the rw transaction)", async () => {
    // Regression: cascade target used to be queried *before* opening the rw
    // transaction. That left a gap in which a concurrent writer could insert
    // a card targeting the same deck; the deck would then be deleted while
    // the new card remained as an orphan with a stale deckId.
    //
    // We can't easily simulate a second tab inside vitest, so this test
    // checks the post-condition that the new (in-txn) variant guarantees:
    // after deleteDeckWithCascade, NO card row references the deleted deck,
    // even if cards exist that the caller didn't pass in.
    const deck = await createDeckInDb({ name: "Latein" });
    // Add a fistful of cards directly via db, bypassing planner-side hints.
    for (let i = 0; i < 5; i++) {
      await createCardInDb({ deckId: deck.id, front: `f${i}`, back: `b${i}` });
    }

    await deleteDeckWithCascade(deck.id);

    // The deck is gone.
    expect(await db.decks.get(deck.id)).toBeUndefined();
    // And — the load-bearing assertion — no orphans linger.
    expect(await db.cards.where("deckId").equals(deck.id).count()).toBe(0);
  });

  it("handles an empty deck (cascade target is empty)", async () => {
    const deck = await createDeckInDb({ name: "Empty" });
    const snap = await deleteDeckWithCascade(deck.id);
    expect(snap.cards).toEqual([]);
    expect(snap.reviewStates).toEqual([]);
    expect(await db.decks.get(deck.id)).toBeUndefined();
  });

  it("restores deck, cards, and review-states from the snapshot", async () => {
    const deck = await createDeckInDb({ name: "Latein", description: "intro" });
    const c1 = await createCardInDb({ deckId: deck.id, front: "a", back: "b", tags: ["t1"] });
    await putReviewState(c1.id, { ...INITIAL_REVIEW_STATE, repetitions: 5 });

    const snap = await deleteDeckWithCascade(deck.id);
    await restoreDeletedDeck(snap);

    expect((await db.decks.get(deck.id))?.description).toBe("intro");
    const restoredCard = await db.cards.get(c1.id);
    expect(restoredCard?.tags).toEqual(["t1"]);
    expect((await db.reviewStates.get(c1.id))?.repetitions).toBe(5);
  });
});

describe("deleteDeckSetWithCascade", () => {
  beforeEach(async () => {
    await db.open();
    await reset();
  });
  afterEach(reset);

  it("detaches member decks (they become lose) and removes the set", async () => {
    await db.deckSets.put({ id: "s1", name: "Medizin" });
    const d1 = await createDeckInDb({ name: "Anatomie", deckSetId: "s1" });
    const d2 = await createDeckInDb({ name: "Histo", deckSetId: "s1" });
    // Lose deck — must not be touched.
    const loose = await createDeckInDb({ name: "Lose" });

    const snap = await deleteDeckSetWithCascade("s1");
    expect(snap.deckSet.id).toBe("s1");
    expect(snap.detachedDecks.map((d) => d.id).sort()).toEqual([d1.id, d2.id].sort());

    expect(await db.deckSets.get("s1")).toBeUndefined();
    expect((await db.decks.get(d1.id))?.deckSetId).toBeUndefined();
    expect((await db.decks.get(d2.id))?.deckSetId).toBeUndefined();
    // Lose deck stays lose.
    expect((await db.decks.get(loose.id))?.deckSetId).toBeUndefined();
  });

  it("does NOT cascade-delete the member decks (they stay alive as lose decks)", async () => {
    await db.deckSets.put({ id: "s1", name: "Medizin" });
    const d1 = await createDeckInDb({ name: "Anatomie", deckSetId: "s1" });
    const c1 = await createCardInDb({ deckId: d1.id, front: "a", back: "b" });

    await deleteDeckSetWithCascade("s1");

    expect(await db.decks.get(d1.id)).toBeDefined();
    expect(await db.cards.get(c1.id)).toBeDefined();
  });

  it("leaves no decks still attached to the set after the cascade (read inside rw txn)", async () => {
    // Regression mirror of the deleteDeckWithCascade variant: member decks
    // were previously queried *before* opening the rw transaction. We now
    // query them inside the same transaction so no deck can be left with a
    // stale `deckSetId` pointing at a deleted set.
    await db.deckSets.put({ id: "s1", name: "Medizin" });
    for (let i = 0; i < 4; i++) {
      await createDeckInDb({ name: `d${i}`, deckSetId: "s1" });
    }

    await deleteDeckSetWithCascade("s1");

    expect(await db.deckSets.get("s1")).toBeUndefined();
    expect(await db.decks.where("deckSetId").equals("s1").count()).toBe(0);
  });

  it("handles an empty set (no detached decks)", async () => {
    await db.deckSets.put({ id: "s-empty", name: "Empty Set" });
    const snap = await deleteDeckSetWithCascade("s-empty");
    expect(snap.detachedDecks).toEqual([]);
    expect(await db.deckSets.get("s-empty")).toBeUndefined();
  });

  it("restores the set and re-attaches the previously-detached decks", async () => {
    await db.deckSets.put({ id: "s1", name: "Medizin" });
    const d1 = await createDeckInDb({ name: "Anatomie", deckSetId: "s1" });

    const snap = await deleteDeckSetWithCascade("s1");
    await restoreDeletedDeckSet(snap);

    expect((await db.deckSets.get("s1"))?.name).toBe("Medizin");
    expect((await db.decks.get(d1.id))?.deckSetId).toBe("s1");
  });

  it("preserves the deck-set's optional description through delete + restore", async () => {
    // Regression: prior to this fix `DeletedDeckSetSnapshot.deckSet` captured
    // only `{id, name}`, dropping the `description` field that DeckSetRow has
    // carried since schema v4 (issue #19). On undo the row was put back
    // without a description — silently losing data. ADR-0014 demands that
    // "Undo stellt das Objekt vollständig wieder her".
    await db.deckSets.put({ id: "s-desc", name: "Medizin", description: "Vorklinik" });
    const snap = await deleteDeckSetWithCascade("s-desc");
    expect(snap.deckSet.description).toBe("Vorklinik");

    await restoreDeletedDeckSet(snap);
    const restored = await db.deckSets.get("s-desc");
    expect(restored?.description).toBe("Vorklinik");
  });

  it("an empty deck-set stays empty after delete + restore (no auto-creation of phantom decks)", async () => {
    // ADR-0014: empty Deck-Sets bleiben bestehen (symmetrisch zu leeren Decks).
    await db.deckSets.put({ id: "s-empty", name: "Empty Set" });
    const snap = await deleteDeckSetWithCascade("s-empty");
    await restoreDeletedDeckSet(snap);

    expect(await db.deckSets.get("s-empty")).toBeDefined();
    expect(await db.decks.where("deckSetId").equals("s-empty").count()).toBe(0);
  });
});
