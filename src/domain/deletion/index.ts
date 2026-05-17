// Deletion domain — pure cascade-rule planner. No imports from React, Dexie, Jotai.
// See ADR-0014 (Lösch-Semantik: Hard-Delete, Cascade, 10s-Undo) and CONTEXT.md.
//
// The planner takes a snapshot of the relevant data and answers: given a
// target (Card/Deck/Deck-Set), which IDs need to be removed (or detached) in
// the eventual IndexedDB transaction? Keeping this pure means:
//   1. The DB layer just walks the plan and emits Dexie operations.
//   2. The UI layer can predict — *before* the commit — what will disappear
//      (used for the deck-delete modal's card-count and for optimistic hide).
//   3. The cascade rules live in one place and are unit-testable without IDB.
//
// Cascade rules per ADR-0014:
//   - Card delete   → remove the Card and its Review-State.
//   - Deck delete   → remove the Deck, all Cards in that Deck, and all
//                     Review-States of those Cards. Deck-Set membership of
//                     the Deck is irrelevant (deleting a Deck never deletes
//                     a Deck-Set).
//   - Deck-Set delete → remove the Deck-Set itself, and *detach* every
//                       member Deck so it becomes "lose" (deckSetId undefined).
//                       Member Decks and their Cards stay alive.

export type CardLite = { id: string; deckId: string };
export type DeckLite = { id: string; deckSetId?: string };

export type DeleteCardPlan = {
  readonly kind: "card";
  readonly cardId: string;
  /** Review-State ids to remove. Always `[cardId]` (1:1), exposed for symmetry. */
  readonly reviewStateCardIds: readonly string[];
};

export type DeleteDeckPlan = {
  readonly kind: "deck";
  readonly deckId: string;
  /** Cards in the doomed deck. */
  readonly cardIds: readonly string[];
  /** Review-State ids to remove — one per cardId. */
  readonly reviewStateCardIds: readonly string[];
};

export type DeleteDeckSetPlan = {
  readonly kind: "deck-set";
  readonly deckSetId: string;
  /** Member decks that get detached (deckSetId → undefined). */
  readonly detachedDeckIds: readonly string[];
};

export type DeletionPlan = DeleteCardPlan | DeleteDeckPlan | DeleteDeckSetPlan;

/** Plan a Card delete. The card-row's deckId is irrelevant to the cascade. */
export function planDeleteCard(cardId: string): DeleteCardPlan {
  return { kind: "card", cardId, reviewStateCardIds: [cardId] };
}

/**
 * Plan a Deck delete. Caller supplies the cards belonging to the deck; the
 * planner returns the ids to remove. Card ordering is preserved purely for
 * deterministic tests — the DB layer doesn't depend on it.
 */
export function planDeleteDeck(deckId: string, cardsInDeck: readonly CardLite[]): DeleteDeckPlan {
  const cardIds = cardsInDeck.filter((c) => c.deckId === deckId).map((c) => c.id);
  return {
    kind: "deck",
    deckId,
    cardIds,
    reviewStateCardIds: cardIds,
  };
}

/**
 * Plan a Deck-Set delete. Caller supplies the decks; the planner returns the
 * ids of the decks that need to be detached (deckSetId cleared). The decks
 * themselves are NOT deleted — they fall out of the set and become lose
 * (ADR-0003 legitimises lose Decks; ADR-0014 codifies this cascade choice).
 */
export function planDeleteDeckSet(
  deckSetId: string,
  decks: readonly DeckLite[],
): DeleteDeckSetPlan {
  const detachedDeckIds = decks.filter((d) => d.deckSetId === deckSetId).map((d) => d.id);
  return {
    kind: "deck-set",
    deckSetId,
    detachedDeckIds,
  };
}
