import { db } from "@/db/database";

/**
 * Wipe all user-generated data from IndexedDB.
 *
 * Removes every row from every table — decks, deck-sets, cards, review-states
 * and review logs. Per the brief (issue #9), this is global Reset-Data: no
 * Undo-Toast (ADR-0014 covers per-Card/Deck/Deck-Set delete, not global reset),
 * no soft-delete.
 *
 * User-level Settings live in localStorage and are intentionally NOT touched
 * by this function — language/theme/backup-reminder-frequency are device
 * preferences, not user content. If the future wants a "factory reset" that
 * also clears Settings, that's a separate operation.
 */
export async function wipeAllData(): Promise<void> {
  // One transaction across all tables so the wipe is atomic — a tab kill mid-
  // way leaves either the full pre-state or the full empty-state, never a
  // half-deleted database.
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
    },
  );
}
