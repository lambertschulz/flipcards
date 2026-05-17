// Gather everything in IndexedDB into a BackupFileV1.
//
// Sits between the DB layer (`src/db/*`) and the pure domain (`src/domain/backup`).
// We do the read in a single Dexie transaction so the snapshot is consistent —
// without `readonly` lock all tables, a concurrent write between two `toArray()`
// calls could produce a backup with e.g. a card that no longer belongs to its
// deck. Backup is the full local snapshot; consistency matters.

import { db } from "@/db/database";
import { type BackupFileV1, exportBackup } from "@/domain/backup";

export type CollectClock = { now: () => Date };

const defaultClock: CollectClock = { now: () => new Date() };

export async function collectBackup(clock: CollectClock = defaultClock): Promise<BackupFileV1> {
  // Read-only transaction across every entity table. Dexie serialises this
  // against any concurrent writer.
  const [deckRows, deckSetRows, cardRows, reviewStateRows, reviewLogRows] = await db.transaction(
    "r",
    [db.decks, db.deckSets, db.cards, db.reviewStates, db.reviews],
    async () => [
      await db.decks.toArray(),
      await db.deckSets.toArray(),
      await db.cards.toArray(),
      await db.reviewStates.toArray(),
      await db.reviews.toArray(),
    ],
  );

  // Group cards by deck. A deck that exists with zero cards still ships as
  // `cards: []` — Backup round-trips empty decks intentionally.
  const cardsByDeck = new Map<string, BackupFileV1["decks"][number]["cards"]>();
  for (const card of cardRows) {
    const list = cardsByDeck.get(card.deckId);
    const entry = { id: card.id, front: card.front, back: card.back, tags: [...(card.tags ?? [])] };
    if (list) list.push(entry);
    else cardsByDeck.set(card.deckId, [entry]);
  }

  // Orphan cards (deckId references a deck no longer present) are dropped —
  // the schema's deck→card refines would reject them on import otherwise.
  // The DB invariant says this shouldn't happen, but we don't gamble on it
  // here. Logging is out-of-scope for v1; if it becomes a problem we'll add
  // a diagnostic toast at export time.
  const deckIdSet = new Set(deckRows.map((d) => d.id));
  for (const orphanDeckId of cardsByDeck.keys()) {
    if (!deckIdSet.has(orphanDeckId)) cardsByDeck.delete(orphanDeckId);
  }

  const deckSets = deckSetRows.map((row) => ({
    id: row.id,
    name: row.name,
    ...(row.description !== undefined ? { description: row.description } : {}),
  }));

  // Drop any `deckSetId` whose target row isn't in the exported `deckSets`.
  // The home page tolerates a deck pointing at a missing Deck-Set (treats it
  // as lose), but the backup schema's `decks.deckSetId must reference…`
  // refine would reject such a file on re-import. Round-trip must work for
  // any locally tolerated state, so we silently sanitise the orphan to lose.
  const deckSetIdSet = new Set(deckSetRows.map((s) => s.id));
  const decks = deckRows.map((row) => {
    const deckSetId =
      row.deckSetId !== undefined && deckSetIdSet.has(row.deckSetId) ? row.deckSetId : undefined;
    return {
      id: row.id,
      name: row.name,
      ...(row.description !== undefined ? { description: row.description } : {}),
      ...(deckSetId !== undefined ? { deckSetId } : {}),
      cards: cardsByDeck.get(row.id) ?? [],
    };
  });

  // Filter review-states and review-logs whose cardId no longer exists in
  // any deck. Same defensive rationale as orphan cards above — the schema
  // would reject the file otherwise.
  const liveCardIds = new Set<string>();
  for (const deck of decks) for (const card of deck.cards) liveCardIds.add(card.id);

  const reviewStates = reviewStateRows
    .filter((row) => liveCardIds.has(row.cardId))
    .map((row) => ({
      cardId: row.cardId,
      repetitions: row.repetitions,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      nextDue: row.nextDue,
    }));

  const reviews = reviewLogRows
    .filter((row) => liveCardIds.has(row.cardId))
    .map((row) => ({
      id: row.id,
      cardId: row.cardId,
      timestamp: row.timestamp,
      rating: row.rating,
      intervalAfter: row.intervalAfter,
      easeAfter: row.easeAfter,
    }));

  return exportBackup({
    decks,
    deckSets,
    reviewStates,
    reviews,
    now: clock.now,
  });
}
