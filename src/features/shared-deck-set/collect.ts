// Gather a Deck-Set + all its member Decks + their Cards from IndexedDB
// into a SharedDeckSet file.
//
// Sits between the DB layer (`src/db/*`) and the pure domain
// (`src/domain/shared-deck`). Review-states are **never** read here —
// CONTEXT.md (Shared Deck-Set) is explicit that a Shared Deck-Set carries
// no learning progress. The four involved tables (deckSets, decks, cards
// — review-states stay out) are read in a single Dexie read-only
// transaction so the snapshot is consistent against a concurrent writer.

import { db } from "@/db/database";
import {
  SHARED_DECK_SET_FORMAT,
  type SharedCard,
  type SharedDeckEntry,
  type SharedDeckSet,
} from "@/domain/shared-deck";

export type CollectClock = { now: () => Date };

const defaultClock: CollectClock = { now: () => new Date() };

export class DeckSetNotFoundError extends Error {
  readonly deckSetId: string;
  constructor(deckSetId: string) {
    super(`Deck-Set not found: ${deckSetId}`);
    this.name = "DeckSetNotFoundError";
    this.deckSetId = deckSetId;
  }
}

export async function collectSharedDeckSet(
  deckSetId: string,
  clock: CollectClock = defaultClock,
): Promise<SharedDeckSet> {
  const [setRow, deckRows, cardRows] = await db.transaction(
    "r",
    [db.deckSets, db.decks, db.cards],
    async () => {
      const set = await db.deckSets.get(deckSetId);
      const decks = await db.decks.where("deckSetId").equals(deckSetId).toArray();
      // Pull every card whose deck belongs to this set. Doing the filter in
      // JS (rather than `.anyOf` per deckId) keeps the transaction to a
      // single table-wide read and avoids one round-trip per deck — the
      // export path is one-shot and the cards table is the only large
      // table that matters here.
      const memberIds = new Set(decks.map((d) => d.id));
      const cards = await db.cards.filter((c) => memberIds.has(c.deckId)).toArray();
      return [set, decks, cards] as const;
    },
  );

  if (!setRow) throw new DeckSetNotFoundError(deckSetId);

  // Group cards by deckId so each deck entry carries only its own cards.
  const cardsByDeck = new Map<string, SharedCard[]>();
  for (const row of cardRows) {
    const list = cardsByDeck.get(row.deckId);
    const card: SharedCard = {
      id: row.id,
      front: row.front,
      back: row.back,
      tags: [...(row.tags ?? [])],
    };
    if (list) list.push(card);
    else cardsByDeck.set(row.deckId, [card]);
  }

  const decks: SharedDeckEntry[] = deckRows.map((row) => ({
    id: row.id,
    name: row.name,
    ...(row.description !== undefined ? { description: row.description } : {}),
    cards: cardsByDeck.get(row.id) ?? [],
  }));

  return {
    format: SHARED_DECK_SET_FORMAT,
    formatVersion: 1,
    exportedAt: clock.now().toISOString(),
    deckSet: {
      id: setRow.id,
      name: setRow.name,
      ...(setRow.description !== undefined ? { description: setRow.description } : {}),
    },
    decks,
  };
}
