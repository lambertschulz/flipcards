import { db } from "@/db/database";
import {
  type DeleteCardPlan,
  type DeleteDeckPlan,
  type DeleteDeckSetPlan,
  planDeleteCard,
  planDeleteDeck,
  planDeleteDeckSet,
} from "@/domain/deletion";

/**
 * IndexedDB deletion entry-points. Every public function here runs the
 * cascade in a single Dexie transaction so a mid-flight tab-kill cannot
 * leave a half-state (ADR-0014).
 *
 * These functions are the *canonical* delete entrypoints for the persistence
 * layer. Callers (UI, pending-deletes coordinator) MUST go through them
 * instead of poking `db.cards.delete(...)` directly — that's how the cascade
 * rules stay in one place.
 *
 * Note: the legacy `deleteCard()` in `src/db/cards.ts` only removes the card
 * row and was missing the Review-State cleanup; `deleteCardWithCascade()`
 * here replaces it for new call-sites. The old export remains for now to
 * keep the existing tests green — issue #8's UI plumbing wires up the new
 * cascade variant on every user-facing delete affordance.
 */

export type DeletedCardSnapshot = {
  card: { id: string; deckId: string; front: string; back: string; tags: string[] };
  reviewState?: {
    cardId: string;
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    nextDue: number;
  };
};

export type DeletedDeckSnapshot = {
  deck: { id: string; name: string; description?: string; deckSetId?: string };
  cards: DeletedCardSnapshot["card"][];
  reviewStates: NonNullable<DeletedCardSnapshot["reviewState"]>[];
};

export type DeletedDeckSetSnapshot = {
  deckSet: { id: string; name: string };
  /** Decks that were detached from this set. We snapshot the previous deckSetId so undo can re-attach. */
  detachedDecks: { id: string; previousDeckSetId: string }[];
};

/**
 * Plan + delete a Card and its Review-State in one transaction.
 * Returns a snapshot suitable for undo.
 */
export async function deleteCardWithCascade(cardId: string): Promise<DeletedCardSnapshot> {
  const plan = planDeleteCard(cardId);
  return executeCardDelete(plan);
}

/**
 * Plan + delete a Deck, its Cards, and their Review-States atomically.
 * Returns a snapshot suitable for undo.
 */
export async function deleteDeckWithCascade(deckId: string): Promise<DeletedDeckSnapshot> {
  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  const plan = planDeleteDeck(
    deckId,
    cards.map((c) => ({ id: c.id, deckId: c.deckId })),
  );
  return executeDeckDelete(plan);
}

/**
 * Plan + delete a Deck-Set; member decks are detached (deckSetId cleared) but
 * stay alive. Returns a snapshot recording the *previous* deckSetId of each
 * detached deck so undo can restore set-membership precisely.
 */
export async function deleteDeckSetWithCascade(deckSetId: string): Promise<DeletedDeckSetSnapshot> {
  const decks = await db.decks.where("deckSetId").equals(deckSetId).toArray();
  const plan = planDeleteDeckSet(
    deckSetId,
    decks.map((d) => ({ id: d.id, deckSetId: d.deckSetId })),
  );
  return executeDeckSetDelete(plan);
}

// --- Internals -------------------------------------------------------------

async function executeCardDelete(plan: DeleteCardPlan): Promise<DeletedCardSnapshot> {
  return db.transaction("rw", db.cards, db.reviewStates, async () => {
    const cardRow = await db.cards.get(plan.cardId);
    if (!cardRow) {
      // Already gone — return a synthetic snapshot so callers stay simple.
      return { card: { id: plan.cardId, deckId: "", front: "", back: "", tags: [] } };
    }
    const stateRow = await db.reviewStates.get(plan.cardId);
    await db.cards.delete(plan.cardId);
    if (stateRow) await db.reviewStates.delete(plan.cardId);
    return {
      card: {
        id: cardRow.id,
        deckId: cardRow.deckId,
        front: cardRow.front,
        back: cardRow.back,
        tags: [...(cardRow.tags ?? [])],
      },
      reviewState: stateRow
        ? {
            cardId: stateRow.cardId,
            repetitions: stateRow.repetitions,
            easeFactor: stateRow.easeFactor,
            intervalDays: stateRow.intervalDays,
            nextDue: stateRow.nextDue,
          }
        : undefined,
    };
  });
}

async function executeDeckDelete(plan: DeleteDeckPlan): Promise<DeletedDeckSnapshot> {
  return db.transaction("rw", db.decks, db.cards, db.reviewStates, async () => {
    const deckRow = await db.decks.get(plan.deckId);
    const cardRows = plan.cardIds.length > 0 ? await db.cards.bulkGet([...plan.cardIds]) : [];
    const stateRows =
      plan.reviewStateCardIds.length > 0
        ? await db.reviewStates.bulkGet([...plan.reviewStateCardIds])
        : [];

    if (deckRow) await db.decks.delete(plan.deckId);
    if (plan.cardIds.length > 0) await db.cards.bulkDelete([...plan.cardIds]);
    if (plan.reviewStateCardIds.length > 0)
      await db.reviewStates.bulkDelete([...plan.reviewStateCardIds]);

    return {
      deck: deckRow
        ? {
            id: deckRow.id,
            name: deckRow.name,
            description: deckRow.description,
            deckSetId: deckRow.deckSetId,
          }
        : { id: plan.deckId, name: "" },
      cards: cardRows
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({
          id: c.id,
          deckId: c.deckId,
          front: c.front,
          back: c.back,
          tags: [...(c.tags ?? [])],
        })),
      reviewStates: stateRows
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({
          cardId: s.cardId,
          repetitions: s.repetitions,
          easeFactor: s.easeFactor,
          intervalDays: s.intervalDays,
          nextDue: s.nextDue,
        })),
    };
  });
}

async function executeDeckSetDelete(plan: DeleteDeckSetPlan): Promise<DeletedDeckSetSnapshot> {
  return db.transaction("rw", db.deckSets, db.decks, async () => {
    const setRow = await db.deckSets.get(plan.deckSetId);
    const detached: DeletedDeckSetSnapshot["detachedDecks"] = [];

    for (const deckId of plan.detachedDeckIds) {
      const deckRow = await db.decks.get(deckId);
      if (!deckRow || deckRow.deckSetId !== plan.deckSetId) continue;
      detached.push({ id: deckId, previousDeckSetId: plan.deckSetId });
      await db.decks.put({ ...deckRow, deckSetId: undefined });
    }

    if (setRow) await db.deckSets.delete(plan.deckSetId);

    return {
      deckSet: setRow ? { id: setRow.id, name: setRow.name } : { id: plan.deckSetId, name: "" },
      detachedDecks: detached,
    };
  });
}

// --- Undo restorers --------------------------------------------------------
//
// These are the inverse of the delete-with-cascade helpers. They live in the
// DB layer (not the coordinator) because they need direct Dexie access and
// also run inside a transaction to keep state coherent. The coordinator
// calls them when the user hits "Rückgängig" within the 10s window.

export async function restoreDeletedCard(snapshot: DeletedCardSnapshot): Promise<void> {
  await db.transaction("rw", db.cards, db.reviewStates, async () => {
    await db.cards.put({
      id: snapshot.card.id,
      deckId: snapshot.card.deckId,
      front: snapshot.card.front,
      back: snapshot.card.back,
      tags: [...snapshot.card.tags],
    });
    if (snapshot.reviewState) {
      await db.reviewStates.put({ ...snapshot.reviewState });
    }
  });
}

export async function restoreDeletedDeck(snapshot: DeletedDeckSnapshot): Promise<void> {
  await db.transaction("rw", db.decks, db.cards, db.reviewStates, async () => {
    const deckRow: { id: string; name: string; description?: string; deckSetId?: string } = {
      id: snapshot.deck.id,
      name: snapshot.deck.name,
    };
    if (snapshot.deck.description !== undefined) deckRow.description = snapshot.deck.description;
    if (snapshot.deck.deckSetId !== undefined) deckRow.deckSetId = snapshot.deck.deckSetId;
    await db.decks.put(deckRow);
    if (snapshot.cards.length > 0)
      await db.cards.bulkPut(snapshot.cards.map((c) => ({ ...c, tags: [...c.tags] })));
    if (snapshot.reviewStates.length > 0)
      await db.reviewStates.bulkPut(snapshot.reviewStates.map((s) => ({ ...s })));
  });
}

export async function restoreDeletedDeckSet(snapshot: DeletedDeckSetSnapshot): Promise<void> {
  await db.transaction("rw", db.deckSets, db.decks, async () => {
    await db.deckSets.put({ id: snapshot.deckSet.id, name: snapshot.deckSet.name });
    for (const entry of snapshot.detachedDecks) {
      const deckRow = await db.decks.get(entry.id);
      if (!deckRow) continue;
      await db.decks.put({ ...deckRow, deckSetId: entry.previousDeckSetId });
    }
  });
}
