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
  return await db.transaction("rw", [db.decks, db.cards], async () => {
    const existingDeck = await db.decks.get(file.deck.id);

    if (existingDeck) {
      // Branch 1: additive merge per card-ID.
      const existingCardIds = new Set(
        (await db.cards.where("deckId").equals(existingDeck.id).primaryKeys()) as string[],
      );
      const toAdd: CardRow[] = [];
      for (const card of file.cards) {
        if (existingCardIds.has(card.id)) continue;
        toAdd.push({
          id: card.id,
          deckId: existingDeck.id,
          front: card.front,
          back: card.back,
          tags: [...card.tags],
        });
      }
      if (toAdd.length > 0) await db.cards.bulkPut(toAdd);

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

    const cardRows: CardRow[] = file.cards.map((c) => ({
      id: c.id,
      deckId: file.deck.id,
      front: c.front,
      back: c.back,
      tags: [...c.tags],
    }));
    if (cardRows.length > 0) await db.cards.bulkPut(cardRows);

    return {
      mode: nameTaken ? "renamed" : "new",
      deckId: file.deck.id,
      deckName: finalName,
      cardsAdded: cardRows.length,
      cardsSkipped: 0,
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
