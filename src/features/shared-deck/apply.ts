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
// Returns a summary the page renders as the success toast.

import { type CardRow, type DeckRow, db } from "@/db/database";
import type { SharedDeck } from "@/domain/shared-deck";

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
  return await db.transaction("rw", [db.decks, db.cards, db.reviewStates], async () => {
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
      // Drop any orphan reviewStates rows for the card-ids we're about to add.
      // `deleteCard` does NOT cascade reviewStates, so an earlier card with the
      // same id could leave a stale row behind. Without this purge the imported
      // card would inherit that stale progress and not surface as fresh-Due,
      // violating "Shared Decks carry no review state, fresh due on import"
      // (CONTEXT.md). Local-always-wins only applies to extant card rows.
      if (toAdd.length > 0) {
        await db.reviewStates.bulkDelete(toAdd.map((c) => c.id));
        // `add` (not `put`) would also be safe here since we've filtered globally,
        // but bulkPut keeps the code uniform and we've proven the keys are unique.
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

    // New-deck branch: still filter against the global card-ID set so we never
    // clobber a card that lives in some other local deck.
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
    // Same orphan-purge as the merge branch — see comment above.
    if (cardRows.length > 0) {
      await db.reviewStates.bulkDelete(cardRows.map((c) => c.id));
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
  });
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
