// Gather a single Deck + its Cards from IndexedDB into a SharedDeck file.
//
// Sits between the DB layer (`src/db/*`) and the pure domain
// (`src/domain/shared-deck`). Review-states are **never** read here —
// CONTEXT.md (Shared Deck) is explicit that a Shared Deck carries no
// learning progress. Reading the two relevant tables in a single Dexie
// read-only transaction guarantees a consistent (deck, cards) snapshot
// even if a concurrent writer mutates the deck mid-export.

import { db } from "@/db/database";
import { SHARED_DECK_FORMAT, type SharedCard, type SharedDeck } from "@/domain/shared-deck";

export type CollectClock = { now: () => Date };

const defaultClock: CollectClock = { now: () => new Date() };

export class DeckNotFoundError extends Error {
  readonly deckId: string;
  constructor(deckId: string) {
    super(`Deck not found: ${deckId}`);
    this.name = "DeckNotFoundError";
    this.deckId = deckId;
  }
}

export async function collectSharedDeck(
  deckId: string,
  clock: CollectClock = defaultClock,
): Promise<SharedDeck> {
  const [deckRow, cardRows] = await db.transaction("r", [db.decks, db.cards], async () => [
    await db.decks.get(deckId),
    await db.cards.where("deckId").equals(deckId).toArray(),
  ]);

  if (!deckRow) throw new DeckNotFoundError(deckId);

  const cards: SharedCard[] = cardRows.map((row) => ({
    id: row.id,
    front: row.front,
    back: row.back,
    tags: [...(row.tags ?? [])],
  }));

  return {
    format: SHARED_DECK_FORMAT,
    formatVersion: 1,
    exportedAt: clock.now().toISOString(),
    deck: {
      id: deckRow.id,
      name: deckRow.name,
      ...(deckRow.description !== undefined ? { description: deckRow.description } : {}),
    },
    cards,
  };
}
