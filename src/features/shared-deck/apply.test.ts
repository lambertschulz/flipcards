// ADR-0011 (Shared-Deck-Import) is the spec these tests pin down:
//   1. Deck-ID match → additive merge per card-ID; local wins on duplicates.
//   2. Name collision without ID match → import gets a "(N)" suffix.
//   3. No match → fresh import.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/database";
import { SHARED_DECK_FORMAT, type SharedDeck } from "@/domain/shared-deck";
import { applySharedDeckImport } from "./apply";

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function makeFile(overrides: Partial<SharedDeck> = {}): SharedDeck {
  return {
    format: SHARED_DECK_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-05-17T08:00:00Z",
    deck: { id: "deck-shared01", name: "Französisch", description: "Vokabeln" },
    cards: [
      { id: "card-share001", front: "bonjour", back: "hallo", tags: ["fr"] },
      { id: "card-share002", front: "au revoir", back: "tschüss", tags: [] },
    ],
    ...overrides,
  };
}

describe("applySharedDeckImport — fresh import", () => {
  it("creates the deck and all cards verbatim when no local deck has the ID or name", async () => {
    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("new");
    expect(summary.cardsAdded).toBe(2);
    expect(summary.cardsSkipped).toBe(0);

    const deck = await db.decks.get("deck-shared01");
    expect(deck?.name).toBe("Französisch");
    expect(deck?.description).toBe("Vokabeln");
    const cards = await db.cards.where("deckId").equals("deck-shared01").toArray();
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.id === "card-share001")?.tags).toEqual(["fr"]);
  });
});

describe("applySharedDeckImport — ID match (additive merge)", () => {
  it("adds only the cards not already present and leaves local content untouched", async () => {
    // Local: same deck-id, with one card whose id ALSO appears in the file.
    // The local card has different content — the merge must NOT overwrite it.
    await db.decks.add({ id: "deck-shared01", name: "Existing local name" });
    await db.cards.add({
      id: "card-share001",
      deckId: "deck-shared01",
      front: "LOCAL FRONT",
      back: "LOCAL BACK",
      tags: ["local"],
    });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("merged");
    expect(summary.cardsAdded).toBe(1); // only card-share002 is new
    expect(summary.cardsSkipped).toBe(1);

    // Local card content preserved.
    const local = await db.cards.get("card-share001");
    expect(local?.front).toBe("LOCAL FRONT");
    expect(local?.tags).toEqual(["local"]);

    // Newly-added card landed.
    const added = await db.cards.get("card-share002");
    expect(added?.front).toBe("au revoir");

    // Deck metadata stays as it was locally — name and (missing) description.
    const deck = await db.decks.get("deck-shared01");
    expect(deck?.name).toBe("Existing local name");
    expect(deck?.description).toBeUndefined();
  });
});

describe("applySharedDeckImport — name collision (suffix)", () => {
  it('renames the import to "Name (2)" when a local deck with a different ID has the same name', async () => {
    await db.decks.add({ id: "deck-different", name: "Französisch" });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("renamed");
    expect(summary.deckName).toBe("Französisch (2)");

    const imported = await db.decks.get("deck-shared01");
    expect(imported?.name).toBe("Französisch (2)");
  });

  it('counts up "(3)", "(4)" as collisions accumulate', async () => {
    await db.decks.bulkAdd([
      { id: "d1", name: "Französisch" },
      { id: "d2", name: "Französisch (2)" },
    ]);

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("renamed");
    expect(summary.deckName).toBe("Französisch (3)");
  });
});

describe("applySharedDeckImport — global card-ID collisions", () => {
  it("does NOT overwrite a card that lives in a different local deck (new-deck branch)", async () => {
    // Seed D1 with card "card-share001" containing local content.
    await db.decks.add({ id: "deck-other", name: "Andere" });
    await db.cards.add({
      id: "card-share001",
      deckId: "deck-other",
      front: "LOCAL FRONT",
      back: "LOCAL BACK",
      tags: ["local"],
    });

    // Import a fresh deck (different deck-id, different name) whose cards
    // include the same card-id with different content. Without the global
    // check, bulkPut would silently rewrite D1's card onto the new deck.
    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("new");
    // One card collides globally → skipped; the other lands.
    expect(summary.cardsAdded).toBe(1);
    expect(summary.cardsSkipped).toBe(1);
    expect(summary.cardsTotal).toBe(2);

    // D1's card is unchanged: same deckId, same content, same tags.
    const d1Card = await db.cards.get("card-share001");
    expect(d1Card?.deckId).toBe("deck-other");
    expect(d1Card?.front).toBe("LOCAL FRONT");
    expect(d1Card?.back).toBe("LOCAL BACK");
    expect(d1Card?.tags).toEqual(["local"]);

    // The new deck (D2) exists and contains only the non-colliding card.
    const d2Cards = await db.cards.where("deckId").equals("deck-shared01").toArray();
    expect(d2Cards.map((c) => c.id)).toEqual(["card-share002"]);
  });

  it("does NOT overwrite a card in a different local deck on the merge branch either", async () => {
    // Target deck already exists locally (triggers merge branch). A
    // different local deck holds a card whose id appears in the import.
    await db.decks.add({ id: "deck-shared01", name: "Target" });
    await db.decks.add({ id: "deck-other", name: "Andere" });
    await db.cards.add({
      id: "card-share002",
      deckId: "deck-other",
      front: "LOCAL FRONT",
      back: "LOCAL BACK",
      tags: ["local"],
    });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("merged");
    // card-share001 is new → added to target; card-share002 collides globally
    // (sits in deck-other) → skipped, not migrated.
    expect(summary.cardsAdded).toBe(1);
    expect(summary.cardsSkipped).toBe(1);

    const stillInOther = await db.cards.get("card-share002");
    expect(stillInOther?.deckId).toBe("deck-other");
    expect(stillInOther?.front).toBe("LOCAL FRONT");
    expect(stillInOther?.tags).toEqual(["local"]);

    // Target gets only the non-colliding card.
    const targetCards = await db.cards.where("deckId").equals("deck-shared01").toArray();
    expect(targetCards.map((c) => c.id)).toEqual(["card-share001"]);
  });
});

describe("applySharedDeckImport — frisch importierte Cards sind sofort due", () => {
  it("does not write any review-state on import (cards are due by CONTEXT.md)", async () => {
    await applySharedDeckImport(makeFile());

    // Per CONTEXT.md "Due Card": cards without a review-state are due.
    // We assert by checking the reviewStates table contains no rows for
    // the imported card ids.
    const states = await db.reviewStates.toArray();
    expect(states).toHaveLength(0);
  });

  it("purges orphan reviewStates rows for imported card-ids (new-deck branch)", async () => {
    // Setup: an orphan reviewStates row from a previously-deleted card. The
    // current production `deleteCard` doesn't cascade reviewStates, so this
    // shape genuinely appears in the wild. The card-id matches one we're
    // about to import.
    await db.reviewStates.add({
      cardId: "card-share001",
      repetitions: 7,
      easeFactor: 2.8,
      intervalDays: 30,
      nextDue: Date.now() + 30 * 86_400_000, // far in the future
    });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("new");
    expect(summary.cardsAdded).toBe(2);

    // Invariant: shared-deck imports carry no review state. The orphan row
    // must be gone so the imported card surfaces as fresh-Due.
    const orphan = await db.reviewStates.get("card-share001");
    expect(orphan).toBeUndefined();
    const allStates = await db.reviewStates.toArray();
    expect(allStates).toHaveLength(0);
  });

  it("purges orphan reviewStates rows for added card-ids (merge branch)", async () => {
    // Same scenario but the target deck exists locally so the import takes
    // the merge branch. The orphan row sits on the card-id we'll add.
    await db.decks.add({ id: "deck-shared01", name: "Existing local name" });
    await db.reviewStates.add({
      cardId: "card-share002",
      repetitions: 3,
      easeFactor: 2.5,
      intervalDays: 14,
      nextDue: Date.now() + 14 * 86_400_000,
    });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("merged");
    expect(summary.cardsAdded).toBe(2);

    const orphan = await db.reviewStates.get("card-share002");
    expect(orphan).toBeUndefined();
    const allStates = await db.reviewStates.toArray();
    expect(allStates).toHaveLength(0);
  });

  // Round-4 sharpened-brief regression: the fresh-due invariant covers
  // BOTH per-card-progress tables, not just `reviewStates`. The
  // review-log table (`db.reviews`) has `cardId` as a non-PK index, so a
  // single deleted card can leave many orphan rows. If any survive an
  // import they would attach to the newly-imported card-id and surface
  // as local learning history (counted by backup-collection, etc.),
  // violating "Shared Decks carry no review state, fresh due on import".
  it("purges orphan db.reviews log rows for imported card-ids (new-deck branch)", async () => {
    // Seed a handful of orphan review-log rows on a card-id we're about
    // to import. Multiple rows because `cardId` is a multi-row index.
    await db.reviews.bulkAdd([
      {
        id: "rev-orphan-A",
        cardId: "card-share001",
        timestamp: Date.now() - 7 * 86_400_000,
        rating: "good",
        intervalAfter: 1,
        easeAfter: 2.5,
      },
      {
        id: "rev-orphan-B",
        cardId: "card-share001",
        timestamp: Date.now() - 3 * 86_400_000,
        rating: "easy",
        intervalAfter: 4,
        easeAfter: 2.65,
      },
    ]);

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("new");
    expect(summary.cardsAdded).toBe(2);

    const orphans = await db.reviews.where("cardId").equals("card-share001").toArray();
    expect(orphans).toHaveLength(0);
    // Sanity: no review-log rows whatsoever for the imported card-ids.
    const total = await db.reviews.toArray();
    expect(total).toHaveLength(0);
  });

  it("purges orphan db.reviews log rows for added card-ids (merge branch)", async () => {
    // Merge branch — target deck exists locally; the orphan review-log
    // rows sit on a card-id we'll add via the additive merge.
    await db.decks.add({ id: "deck-shared01", name: "Existing local name" });
    await db.reviews.bulkAdd([
      {
        id: "rev-orphan-C",
        cardId: "card-share002",
        timestamp: Date.now() - 10 * 86_400_000,
        rating: "again",
        intervalAfter: 0,
        easeAfter: 2.3,
      },
      {
        id: "rev-orphan-D",
        cardId: "card-share002",
        timestamp: Date.now() - 1 * 86_400_000,
        rating: "hard",
        intervalAfter: 1,
        easeAfter: 2.25,
      },
    ]);

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("merged");
    expect(summary.cardsAdded).toBe(2);

    const orphans = await db.reviews.where("cardId").equals("card-share002").toArray();
    expect(orphans).toHaveLength(0);
    const total = await db.reviews.toArray();
    expect(total).toHaveLength(0);
  });

  it("purges both per-card-progress tables together on the same card-id (merge branch)", async () => {
    // Combined-table regression: a previously-deleted card-id can leave
    // BOTH an orphan reviewStates row AND orphan review-log rows. The
    // import must purge both inside the same transaction.
    await db.decks.add({ id: "deck-shared01", name: "Existing local name" });
    await db.reviewStates.add({
      cardId: "card-share001",
      repetitions: 5,
      easeFactor: 2.7,
      intervalDays: 21,
      nextDue: Date.now() + 21 * 86_400_000,
    });
    await db.reviews.bulkAdd([
      {
        id: "rev-orphan-E",
        cardId: "card-share001",
        timestamp: Date.now() - 30 * 86_400_000,
        rating: "good",
        intervalAfter: 21,
        easeAfter: 2.7,
      },
    ]);

    const summary = await applySharedDeckImport(makeFile());
    expect(summary.mode).toBe("merged");

    // card-share001 was already present locally (merge branch only adds
    // cards whose ids are NOT in the global set), so the merge skips it.
    // The orphan rows would be invisible because no card row exists to
    // reference them — but the invariant says imports carry NO history.
    //
    // The seeded card-share001 was *only* the orphan reviewStates/reviews;
    // the cards table is empty for that id, so the import treats it as a
    // new card-id (not in globalCardIds) and adds it. Both orphan tables
    // must be purged for that id.
    const addedCard = await db.cards.get("card-share001");
    expect(addedCard).toBeDefined();

    expect(await db.reviewStates.get("card-share001")).toBeUndefined();
    expect(await db.reviews.where("cardId").equals("card-share001").toArray()).toHaveLength(0);
  });
});

describe("applySharedDeckImport — pending-delete coordinator drain (ADR-0014)", () => {
  it("flushes the pending-delete coordinator before mutating the DB (additive path)", async () => {
    // Shared-deck import is *additive* (not clean-slate-replace), so the
    // correct drain primitive is `flushAll()`, not `cancelAll()`:
    //
    //   - `cancelAll()` (used by backup-restore / global-wipe) discards
    //     pending deletes without committing. Using it here would silently
    //     undo the user's UNRELATED delete intent during the 10s undo
    //     window — they clicked "Delete card", then imported a shared deck,
    //     and their delete vanishes.
    //   - `flushAll()` commits every pending delete first, so the import
    //     runs against a consistent view of "current data".
    //
    // This regression pins both halves of the contract:
    //   (a) the pending delete's commit thunk IS called (flush, not cancel)
    //       before the import lands its rows; and
    //   (b) the imported card lands alongside the now-committed delete
    //       result. The pending op is keyed on an UNRELATED card-id so it
    //       cannot mask the import — the test would otherwise be ambiguous
    //       between "import wrote then delete clobbered" and "delete first,
    //       then import wrote", which is exactly the ordering bug.
    const { getPendingDeletes, __resetPendingDeletesForTests } = await import(
      "@/lib/pending-deletes"
    );
    __resetPendingDeletesForTests();
    const store = getPendingDeletes();

    // Seed an unrelated local card; the pending op will commit-delete it.
    // The order assertion below pins flush-before-import: when the import's
    // global card-ID scan runs, this card must already be gone.
    await db.decks.add({ id: "deck-other", name: "Andere" });
    await db.cards.add({
      id: "card-pending-del",
      deckId: "deck-other",
      front: "x",
      back: "y",
      tags: [],
    });

    // The commit thunk actually deletes the row, so the import's global
    // card-ID scan sees a DB without `card-pending-del` — the
    // consistent-view guarantee.
    const commit = vi.fn().mockImplementation(async () => {
      await db.cards.delete("card-pending-del");
    });
    store.enqueue({
      key: "card:card-pending-del",
      label: "Card gelöscht",
      commit,
      restore: async () => {},
    });
    expect(store.list()).toHaveLength(1);

    // Spy on the cards.bulkPut Dexie verb. `bulkPut` is the first write
    // the import does to the cards table; if it fires before `commit`,
    // flush-before-import is violated. We rely on Vitest's
    // `mock.invocationCallOrder` — a monotonically-increasing number
    // assigned across all spies — to prove ordering, so the spy keeps its
    // default call-through behaviour and Dexie's overloaded signature
    // never needs to be re-typed.
    const bulkPutSpy = vi.spyOn(db.cards, "bulkPut");

    await applySharedDeckImport(makeFile());

    // (a) Pending commit thunk WAS called — flush, not cancel.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(0);
    expect(store.isPending("card:card-pending-del")).toBe(false);

    // (a, ordering) Commit ran BEFORE the import's first bulkPut. This is
    // the "flush-before-import" assertion the codex review asked for.
    // Note: assert before `mockRestore`, which wipes `mock.calls` and
    // `mock.invocationCallOrder`.
    expect(bulkPutSpy).toHaveBeenCalled();
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(bulkPutSpy.mock.invocationCallOrder[0]);

    bulkPutSpy.mockRestore();

    // (b) Imported cards landed alongside the now-committed delete result:
    //   - the previously-pending row is gone (commit ran);
    //   - the imported rows are present.
    expect(await db.cards.get("card-pending-del")).toBeUndefined();
    const importedA = await db.cards.get("card-share001");
    expect(importedA).toBeDefined();
    expect(importedA?.front).toBe("bonjour");
    const importedB = await db.cards.get("card-share002");
    expect(importedB).toBeDefined();

    __resetPendingDeletesForTests();
  });
});
