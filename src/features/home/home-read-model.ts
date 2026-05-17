import { db } from "@/db/database";
import type { Deck } from "@/domain/deck";
import type { DeckSet } from "@/domain/deck-set";
import { INITIAL_REVIEW_STATE, type ReviewState, isDue } from "@/domain/sm2";

/**
 * Read-models used by the Home-Screen / Deck-Liste (issue #20).
 *
 * The Dexie loaders here intentionally keep the surface narrow: they hand back
 * the smallest shape the UI actually consumes (Deck-Set list, deck list with
 * per-deck due/total counts, plus a one-line "Heute"-Resumee). Pure helpers
 * are factored out so they can be tested without IndexedDB.
 *
 * Per ADR-0012 the Due-Count surfaces are first-class. We compute them by
 * walking each deck's cards and consulting the per-card review-state (default
 * INITIAL_REVIEW_STATE for cards that have never been answered — those are
 * therefore Due, matching the CONTEXT.md definition of "Due Card").
 */

export type DeckWithCounts = Deck & {
  /** Number of currently Due Cards in this Deck (`nextDue <= now`). */
  dueCount: number;
  /** Total number of Cards in this Deck. */
  totalCount: number;
};

export type HomeSummary = {
  /** Total Due Cards across every Deck (deck-übergreifend). */
  totalDue: number;
  /** Count of distinct Decks that contain at least one Due Card. */
  decksWithDue: number;
};

type ReviewStateLookup = (cardId: string) => ReviewState;

/**
 * Pure variant of {@link listDecksWithDueCounts}. Given an in-memory snapshot
 * of decks, cards and a review-state lookup, return the same shape the loader
 * produces. Sorts alphabetically — see the loader for the sort-policy note.
 */
export function computeDecksWithCounts(
  decks: Deck[],
  cards: Array<{ id: string; deckId: string }>,
  getReviewState: ReviewStateLookup,
  now: number,
): DeckWithCounts[] {
  const totals = new Map<string, number>();
  const dues = new Map<string, number>();
  for (const card of cards) {
    totals.set(card.deckId, (totals.get(card.deckId) ?? 0) + 1);
    if (isDue(getReviewState(card.id), now)) {
      dues.set(card.deckId, (dues.get(card.deckId) ?? 0) + 1);
    }
  }
  return decks.map((deck) => ({
    ...deck,
    dueCount: dues.get(deck.id) ?? 0,
    totalCount: totals.get(deck.id) ?? 0,
  }));
}

/**
 * Pure variant of {@link loadHomeSummary}. Counts Due Cards across all decks
 * plus the number of distinct decks contributing at least one.
 */
export function computeHomeSummary(
  cards: Array<{ id: string; deckId: string }>,
  getReviewState: ReviewStateLookup,
  now: number,
): HomeSummary {
  let totalDue = 0;
  const deckIdsWithDue = new Set<string>();
  for (const card of cards) {
    if (isDue(getReviewState(card.id), now)) {
      totalDue += 1;
      deckIdsWithDue.add(card.deckId);
    }
  }
  return { totalDue, decksWithDue: deckIdsWithDue.size };
}

/**
 * Load every Deck with its current Due-Count and total Card-Count. Sorts
 * alphabetically by deck name.
 *
 * The brief asks for "zuletzt-bearbeitet zuerst" as the default sort but the
 * v1 schema doesn't carry an `updatedAt` timestamp on Deck rows (see
 * `DeckRow` in `src/db/database.ts`). Adding that column is a Dexie-version
 * bump and out of scope for this ticket — alphabetical sort is the brief's
 * named fallback. Wire-in the timestamp later and the sort can switch
 * without changing the read-model's shape.
 */
export async function listDecksWithDueCounts(now: number): Promise<DeckWithCounts[]> {
  const [deckRows, cardRows, reviewStateRows] = await Promise.all([
    db.decks.orderBy("name").toArray(),
    db.cards.toArray(),
    db.reviewStates.toArray(),
  ]);

  const reviewStates = new Map<string, ReviewState>();
  for (const row of reviewStateRows) {
    reviewStates.set(row.cardId, {
      repetitions: row.repetitions,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      nextDue: row.nextDue,
    });
  }
  const lookup: ReviewStateLookup = (cardId) => reviewStates.get(cardId) ?? INITIAL_REVIEW_STATE;

  const decks: Deck[] = deckRows.map((row) => {
    const deck: Deck = { id: row.id, name: row.name };
    if (row.description !== undefined) deck.description = row.description;
    if (row.deckSetId !== undefined) deck.deckSetId = row.deckSetId;
    return deck;
  });

  return computeDecksWithCounts(decks, cardRows, lookup, now);
}

/**
 * Load every Deck-Set, alphabetically by name. Thin wrapper kept here so the
 * Home-Screen has a single import surface for both reads.
 */
export async function listDeckSets(): Promise<DeckSet[]> {
  const rows = await db.deckSets.orderBy("name").toArray();
  return rows.map((row) => {
    const set: DeckSet = { id: row.id, name: row.name };
    if (row.description !== undefined) set.description = row.description;
    return set;
  });
}

/**
 * Load the "Heute"-Resumee — one-line motivational summary at the top of the
 * deck-list ("X Cards fällig in N Decks").
 */
export async function loadHomeSummary(now: number): Promise<HomeSummary> {
  const [cardRows, reviewStateRows] = await Promise.all([
    db.cards.toArray(),
    db.reviewStates.toArray(),
  ]);

  const reviewStates = new Map<string, ReviewState>();
  for (const row of reviewStateRows) {
    reviewStates.set(row.cardId, {
      repetitions: row.repetitions,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      nextDue: row.nextDue,
    });
  }
  const lookup: ReviewStateLookup = (cardId) => reviewStates.get(cardId) ?? INITIAL_REVIEW_STATE;

  return computeHomeSummary(cardRows, lookup, now);
}
