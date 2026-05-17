// Apply a parsed SharedDeckSet to IndexedDB per ADR-0011
// (Shared-Deck-Set-Import).
//
// The ADR is explicit that the import runs without per-deck or per-card
// prompts. Each contained deck is processed via the same three branches
// the Shared-Deck import uses:
//   1. Deck-ID match  → additive merge per card-ID. Local content + name
//                        win; new cards from the file land.
//   2. Name collision → import becomes a NEW deck with a `(N)` suffix.
//      (no ID match)
//   3. Else           → fresh import, deck + cards verbatim.
//
// The set wrapper follows the symmetric rules:
//   • Set-ID match     → keep local set; additive union of member-ids.
//   • Set-name match   → suffix the imported set name.
//   • Else             → fresh set.
//
// Set membership resolution (ADR-0011 "Set-Mitgliedschaft beim
// Deck-Konflikt"):
//   • Deck was lose locally     → adopted into the imported set.
//   • Deck already in another   → stays in its existing set; the imported
//     set                         set is created/updated without it.
//   • Deck newly created by     → joins the imported set per the file.
//     this import
//
// Card-ID collisions are checked GLOBALLY (across all local decks), not
// just against the target deck. Without this, `bulkPut` would silently
// overwrite a row in some other deck that happens to share a primary key
// — destructive data loss, plus stale review-state carried onto unrelated
// content. Local always wins: any imported card whose id already exists
// anywhere is skipped.
//
// Review-state + review-log purge: `deleteCard` does NOT cascade to
// `reviewStates` or `reviews`, so a previously-deleted card with the same
// id can leave orphan rows behind. Without purging, an imported card
// would inherit stale progress (review-states) or stale history (reviews)
// and not surface as fresh-Due, violating "Shared Deck-Sets carry no
// review state, cards are immediately due on import" (CONTEXT.md). We
// bulkDelete both tables for the about-to-be-added card-ids. Local-wins
// only applies to extant card rows.

import { type CardRow, type DeckRow, type DeckSetRow, db } from "@/db/database";
import type { SharedDeckEntry, SharedDeckSet } from "@/domain/shared-deck";

export type DeckApplyMode = "merged" | "renamed" | "new";

export type DeckApplyResult = {
  mode: DeckApplyMode;
  deckId: string;
  deckName: string;
  /** Whether this deck ended up listed under the imported set's wrapper. */
  joinedSet: boolean;
  cardsAdded: number;
  cardsSkipped: number;
  cardsTotal: number;
};

export type SetApplyMode = "merged" | "renamed" | "new";

export type ApplySetSummary = {
  setMode: SetApplyMode;
  setId: string;
  setName: string;
  decks: DeckApplyResult[];
};

export async function applySharedDeckSetImport(file: SharedDeckSet): Promise<ApplySetSummary> {
  return await db.transaction(
    "rw",
    [db.deckSets, db.decks, db.cards, db.reviewStates, db.reviews],
    async () => {
      const allDecks = await db.decks.toArray();
      const allSets = await db.deckSets.toArray();

      // Global card-ID set — any imported card whose id matches ANY existing
      // local card is skipped, regardless of which deck owns the local row.
      const globalCardIds = new Set((await db.cards.toCollection().primaryKeys()) as string[]);

      // Resolve the set wrapper first so we know which id to attach
      // newly-created member decks to.
      const existingSet = await db.deckSets.get(file.deckSet.id);
      let setMode: SetApplyMode;
      let setId: string;
      let setName: string;
      if (existingSet) {
        setMode = "merged";
        setId = existingSet.id;
        setName = existingSet.name;
        // Set metadata stays untouched on ID match.
      } else {
        const nameTaken = allSets.some((s) => s.name === file.deckSet.name);
        setName = nameTaken ? suffixName(file.deckSet.name, allSets) : file.deckSet.name;
        setId = file.deckSet.id;
        const setRow: DeckSetRow = { id: setId, name: setName };
        if (file.deckSet.description !== undefined) setRow.description = file.deckSet.description;
        await db.deckSets.add(setRow);
        setMode = nameTaken ? "renamed" : "new";
      }

      // Track the running list of local decks so name-suffix collisions
      // see decks added earlier in this same import. Same for sets — but
      // sets are only added once at the top, so no running list needed.
      const localDecks: { id: string; name: string }[] = allDecks.map((d) => ({
        id: d.id,
        name: d.name,
      }));

      const deckResults: DeckApplyResult[] = [];
      for (const entry of file.decks) {
        const result = await applyOneDeck(entry, setId, localDecks, globalCardIds);
        deckResults.push(result);
      }

      return { setMode, setId, setName, decks: deckResults };
    },
  );
}

async function applyOneDeck(
  entry: SharedDeckEntry,
  importedSetId: string,
  localDecks: { id: string; name: string }[],
  globalCardIds: Set<string>,
): Promise<DeckApplyResult> {
  const existingDeck = await db.decks.get(entry.id);

  if (existingDeck) {
    // Branch 1: ID match → additive card-merge. Deck metadata stays as it
    // is locally (name, description, deckSetId). Membership rule:
    //   • Locally lose deck    → adopt into imported set.
    //   • Already in some set  → stays there; do NOT list under import.
    let joinedSet = false;
    if (existingDeck.deckSetId === undefined) {
      await db.decks.update(existingDeck.id, { deckSetId: importedSetId });
      joinedSet = true;
    } else if (existingDeck.deckSetId === importedSetId) {
      // Already under the imported set (e.g. set-ID match path). Counts
      // as part of the import for reporting purposes.
      joinedSet = true;
    } else {
      // Lives in another local set — leave alone, do not list under import.
      joinedSet = false;
    }

    const toAdd: CardRow[] = [];
    for (const card of entry.cards) {
      if (globalCardIds.has(card.id)) continue;
      toAdd.push({
        id: card.id,
        deckId: existingDeck.id,
        front: card.front,
        back: card.back,
        tags: [...card.tags],
      });
      globalCardIds.add(card.id);
    }
    await purgeOrphanReviewRowsAndInsert(toAdd);

    return {
      mode: "merged",
      deckId: existingDeck.id,
      deckName: existingDeck.name,
      joinedSet,
      cardsAdded: toAdd.length,
      cardsSkipped: entry.cards.length - toAdd.length,
      cardsTotal: entry.cards.length,
    };
  }

  // No ID match — check name collision against the running local list.
  const nameTaken = localDecks.some((d) => d.name === entry.name);
  const finalName = nameTaken ? suffixName(entry.name, localDecks) : entry.name;

  const deckRow: DeckRow = {
    id: entry.id,
    name: finalName,
    // Newly-created deck joins the imported set per the file.
    deckSetId: importedSetId,
  };
  if (entry.description !== undefined) deckRow.description = entry.description;
  await db.decks.add(deckRow);
  localDecks.push({ id: deckRow.id, name: deckRow.name });

  const cardRows: CardRow[] = [];
  for (const card of entry.cards) {
    if (globalCardIds.has(card.id)) continue;
    cardRows.push({
      id: card.id,
      deckId: entry.id,
      front: card.front,
      back: card.back,
      tags: [...card.tags],
    });
    globalCardIds.add(card.id);
  }
  await purgeOrphanReviewRowsAndInsert(cardRows);

  return {
    mode: nameTaken ? "renamed" : "new",
    deckId: entry.id,
    deckName: finalName,
    joinedSet: true,
    cardsAdded: cardRows.length,
    cardsSkipped: entry.cards.length - cardRows.length,
    cardsTotal: entry.cards.length,
  };
}

async function purgeOrphanReviewRowsAndInsert(rows: CardRow[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((c) => c.id);
  // Drop orphan reviewStates + reviews for these card-ids. `deleteCard`
  // does NOT cascade either table, so a previously-deleted card with the
  // same id could leave stale progress or history behind. See the file
  // header for the rationale.
  await db.reviewStates.bulkDelete(ids);
  await db.reviews.where("cardId").anyOf(ids).delete();
  await db.cards.bulkPut(rows);
}

// Find the smallest `(N)` (starting at 2) that isn't already taken. Used
// for both deck-name and set-name suffixing.
function suffixName(base: string, taken: { name: string }[]): string {
  const names = new Set(taken.map((t) => t.name));
  for (let n = 2; n < 1_000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!names.has(candidate)) return candidate;
  }
  // Defensive: 998 collisions is absurd, but never throw — fall back to a
  // timestamp suffix so the user still gets their import.
  return `${base} (${Date.now()})`;
}
