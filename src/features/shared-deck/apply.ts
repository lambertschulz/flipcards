// Apply a parsed SharedDeck to IndexedDB per ADR-0011 (Shared-Deck-Import).
//
// Three branches, in order:
//   1. Deck-ID match  → additive merge per card-ID.
//                        New cards land; existing IDs are skipped (lokal
//                        gewinnt). Deck metadata stays untouched.
//   2. Name collision → import is created as a NEW deck with a `(N)` suffix
//      (no ID match)    on its name so the user can disambiguate.
//   3. Else           → fresh import, deck + cards verbatim.
//
// No per-deck or per-card prompt — the ADR is explicit that the import
// pathway runs without modal interruption.
//
// Card-ID collisions are checked GLOBALLY (across all local decks), not just
// against the target deck. Otherwise `bulkPut` would silently overwrite a row
// in some other deck that happens to share a primary key — destructive data
// loss, plus stale review-state carried onto unrelated content. Local always
// wins: any imported card whose id already exists anywhere is skipped.
//
// **Fresh-due invariant** (CONTEXT.md "Shared Deck"):
//   After `applySharedDeckImport`, no card-id introduced by the file may
//   have a pre-existing row in any *per-card-progress* table — imported
//   cards must surface as immediately Due, with zero learning history.
//
//   The per-card-progress tables (authoritative against the live Dexie
//   schema in `src/db/database.ts`) are:
//     - `cards`        (the row itself; collision guarded by the global
//                       card-ID check above)
//     - `reviewStates` (PK = `cardId`; one row per card)
//     - `reviews`      (the review-log; `cardId` is a non-PK index, so
//                       a single card can have many rows here)
//
//   `deleteCard` / `deleteDeckWithCascade` / `deleteDeckSetWithCascade`
//   in `src/db/cards.ts` do **not** cascade — they delete only the `cards`
//   row, leaving orphan `reviewStates` and `reviews` rows behind. So when
//   a shared-deck import re-introduces a previously-deleted card-id, those
//   orphan rows would attach to the new card unless we purge them here.
//   We compensate at the import boundary; fixing `deleteCard`'s cascade
//   itself is issue #8's territory.
//
// Returns a summary the page renders as the success toast.

import { type CardRow, type DeckRow, db } from "@/db/database";
import type { SharedDeck } from "@/domain/shared-deck";
import { getPendingDeletes } from "@/lib/pending-deletes";

export type ApplyMode = "merged" | "renamed" | "new";

export type ApplySummary = {
  mode: ApplyMode;
  deckId: string;
  deckName: string;
  cardsAdded: number;
  cardsSkipped: number;
  cardsTotal: number;
};

export async function applySharedDeckImport(file: SharedDeck): Promise<ApplySummary> {
  // ADR-0014 class (b) — bulk-replace path. Even though shared-deck import
  // is *additive* (not clean-slate), it still issues `bulkPut`/`bulkDelete`
  // against `cards` and the per-card-progress tables. A deferred delete in
  // the pending-delete coordinator (10s undo window) whose key collides
  // with an incoming card-id would otherwise fire AFTER the import lands
  // and silently re-delete the freshly-imported row. `cancelAll()` discards
  // pending ops without committing and awaits any commit already in flight.
  // This must run *before* the transaction opens — the coordinator owns
  // its own Dexie writes (via the deletion-coordinator commit thunks) and
  // they cannot be nested inside our `rw` transaction.
  await getPendingDeletes().cancelAll();

  // Single rw-transaction spanning every table this function may touch.
  // The brief enumerates these explicitly so the table-set is derived from
  // the Dexie schema rather than reactively widened one BLOCK at a time:
  //
  //   - decks, deckSets — written/read for the deck-row and name-collision
  //                       lookup (deckSets included even though we never
  //                       mutate it; reserved for future deck-set merge).
  //   - cards            — the import payload.
  //   - reviewStates     — orphan-row purge (per-card-progress table #1).
  //   - reviews          — orphan-row purge (per-card-progress table #2).
  return await db.transaction(
    "rw",
    [db.decks, db.deckSets, db.cards, db.reviewStates, db.reviews],
    async () => {
      // Global card-ID set — any imported card whose id matches ANY existing
      // local card is skipped, regardless of which deck owns the local row.
      // Using bulkPut without this check would overwrite cards in other decks
      // (data loss). Local-always-wins per ADR-0011.
      const globalCardIds = new Set((await db.cards.toCollection().primaryKeys()) as string[]);

      const existingDeck = await db.decks.get(file.deck.id);

      if (existingDeck) {
        // Branch 1: additive merge per card-ID.
        const toAdd: CardRow[] = [];
        for (const card of file.cards) {
          if (globalCardIds.has(card.id)) continue;
          toAdd.push({
            id: card.id,
            deckId: existingDeck.id,
            front: card.front,
            back: card.back,
            tags: [...card.tags],
          });
        }
        if (toAdd.length > 0) {
          await purgePerCardProgress(toAdd.map((c) => c.id));
          // `add` (not `put`) would also be safe here since we've filtered
          // globally, but bulkPut keeps the code uniform and we've proven
          // the keys are unique.
          await db.cards.bulkPut(toAdd);
        }

        return {
          mode: "merged",
          deckId: existingDeck.id,
          deckName: existingDeck.name,
          cardsAdded: toAdd.length,
          cardsSkipped: file.cards.length - toAdd.length,
          cardsTotal: file.cards.length,
        };
      }

      // No ID match — check for a name collision against ALL local decks.
      const allDecks = await db.decks.toArray();
      const nameTaken = allDecks.some((d) => d.name === file.deck.name);
      const finalName = nameTaken ? suffixName(file.deck.name, allDecks) : file.deck.name;

      const deckRow: DeckRow = { id: file.deck.id, name: finalName };
      if (file.deck.description !== undefined) deckRow.description = file.deck.description;
      await db.decks.add(deckRow);

      // New-deck branch: still filter against the global card-ID set so we
      // never clobber a card that lives in some other local deck.
      const cardRows: CardRow[] = [];
      for (const c of file.cards) {
        if (globalCardIds.has(c.id)) continue;
        cardRows.push({
          id: c.id,
          deckId: file.deck.id,
          front: c.front,
          back: c.back,
          tags: [...c.tags],
        });
      }
      if (cardRows.length > 0) {
        await purgePerCardProgress(cardRows.map((c) => c.id));
        await db.cards.bulkPut(cardRows);
      }

      return {
        mode: nameTaken ? "renamed" : "new",
        deckId: file.deck.id,
        deckName: finalName,
        cardsAdded: cardRows.length,
        cardsSkipped: file.cards.length - cardRows.length,
        cardsTotal: file.cards.length,
      };
    },
  );
}

/**
 * Drop every per-card-progress row for the given card-ids. Encodes the
 * fresh-due invariant (file-header comment) in a single place so both
 * import branches (merge AND new-deck) apply identical semantics.
 *
 * Tables, in the order they were added to the Dexie schema:
 *   - `reviewStates` — primary key is `cardId`, so `bulkDelete` by
 *                       card-id is the natural shape.
 *   - `reviews`      — `cardId` is a non-PK index. A single card can have
 *                       many review-log rows, so we delete *by index*
 *                       (`where('cardId').anyOf(...).delete()`) rather
 *                       than by primary key.
 *
 * Caller is responsible for invoking this inside a transaction that
 * includes `reviewStates` and `reviews` (the import transaction does so).
 */
async function purgePerCardProgress(cardIds: readonly string[]): Promise<void> {
  if (cardIds.length === 0) return;
  await db.reviewStates.bulkDelete([...cardIds]);
  await db.reviews
    .where("cardId")
    .anyOf([...cardIds])
    .delete();
}

// Find the smallest `(N)` (starting at 2) that isn't already taken by a local
// deck name. "Französisch" → "Französisch (2)" → "Französisch (3)" …
function suffixName(base: string, allDecks: { name: string }[]): string {
  const taken = new Set(allDecks.map((d) => d.name));
  for (let n = 2; n < 1_000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
  // Defensive: a deck with 998 collisions is absurd, but never throw — fall
  // back to a timestamp suffix so the user still gets their import.
  return `${base} (${Date.now()})`;
}
