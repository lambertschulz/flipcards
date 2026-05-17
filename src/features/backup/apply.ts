// Apply a BackupFileV1 to IndexedDB: clean-slate replace per ADR-0011.
//
// The destructive confirmation lives in the UI (`backup-import-page.tsx`).
// By the time we get here, the parser has already validated the file and
// the user has confirmed the wipe. We perform wipe-and-replace inside a
// single Dexie read/write transaction so a crash mid-flight leaves either
// the full pre-state or the full new-state — never a half-mutated DB.
//
// Returns a summary so the success-toast can show "Imported: N Decks,
// M Cards" per the ticket AC.

import {
  type CardRow,
  type DeckRow,
  type DeckSetRow,
  type ReviewLogRow,
  type ReviewStateRow,
  db,
} from "@/db/database";
import type { BackupFileV1 } from "@/domain/backup";

export type ApplySummary = {
  decks: number;
  deckSets: number;
  cards: number;
  reviewStates: number;
  reviews: number;
};

export async function applyBackup(file: BackupFileV1): Promise<ApplySummary> {
  const deckRows: DeckRow[] = file.decks.map((d) => {
    const row: DeckRow = { id: d.id, name: d.name };
    if (d.description !== undefined) row.description = d.description;
    if (d.deckSetId !== undefined) row.deckSetId = d.deckSetId;
    return row;
  });

  const deckSetRows: DeckSetRow[] = file.deckSets.map((s) => {
    const row: DeckSetRow = { id: s.id, name: s.name };
    if (s.description !== undefined) row.description = s.description;
    return row;
  });

  const cardRows: CardRow[] = file.decks.flatMap((d) =>
    d.cards.map((c) => ({
      id: c.id,
      deckId: d.id,
      front: c.front,
      back: c.back,
      tags: [...c.tags],
    })),
  );

  const reviewStateRows: ReviewStateRow[] = file.reviewStates.map((r) => ({
    cardId: r.cardId,
    repetitions: r.repetitions,
    easeFactor: r.easeFactor,
    intervalDays: r.intervalDays,
    nextDue: r.nextDue,
  }));

  const reviewRows: ReviewLogRow[] = file.reviews.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    timestamp: r.timestamp,
    rating: r.rating,
    intervalAfter: r.intervalAfter,
    easeAfter: r.easeAfter,
  }));

  await db.transaction(
    "rw",
    [db.decks, db.deckSets, db.cards, db.reviewStates, db.reviews],
    async () => {
      await Promise.all([
        db.decks.clear(),
        db.deckSets.clear(),
        db.cards.clear(),
        db.reviewStates.clear(),
        db.reviews.clear(),
      ]);
      // `bulkAdd` is fastest, but `bulkPut` is safer here — even though we
      // just cleared, putting tolerates a transactional retry without
      // duplicate-key drama. The file has already passed Zod-level
      // uniqueness checks, so there can be no duplicate keys to surprise us.
      await Promise.all([
        db.decks.bulkPut(deckRows),
        db.deckSets.bulkPut(deckSetRows),
        db.cards.bulkPut(cardRows),
        db.reviewStates.bulkPut(reviewStateRows),
        db.reviews.bulkPut(reviewRows),
      ]);
    },
  );

  return {
    decks: deckRows.length,
    deckSets: deckSetRows.length,
    cards: cardRows.length,
    reviewStates: reviewStateRows.length,
    reviews: reviewRows.length,
  };
}
