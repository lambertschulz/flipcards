import { type ReviewStateRow, db } from "@/db/database";
import type { Card } from "@/domain/card";
import { INITIAL_REVIEW_STATE, type ReviewState, isDue } from "@/domain/sm2";

function toRow(cardId: string, state: ReviewState): ReviewStateRow {
  return {
    cardId,
    repetitions: state.repetitions,
    easeFactor: state.easeFactor,
    intervalDays: state.intervalDays,
    nextDue: state.nextDue,
  };
}

function fromRow(row: ReviewStateRow): ReviewState {
  return {
    repetitions: row.repetitions,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    nextDue: row.nextDue,
  };
}

export async function getReviewState(cardId: string): Promise<ReviewState> {
  const row = await db.reviewStates.get(cardId);
  return row ? fromRow(row) : { ...INITIAL_REVIEW_STATE };
}

export async function putReviewState(cardId: string, state: ReviewState): Promise<void> {
  await db.reviewStates.put(toRow(cardId, state));
}

export async function listDueCardsInDeck(deckId: string, now: number): Promise<Card[]> {
  const cardRows = await db.cards.where("deckId").equals(deckId).toArray();
  const due: Card[] = [];
  for (const cardRow of cardRows) {
    const state = await getReviewState(cardRow.id);
    if (isDue(state, now)) {
      due.push({
        id: cardRow.id,
        deckId: cardRow.deckId,
        front: cardRow.front,
        back: cardRow.back,
        tags: [...(cardRow.tags ?? [])],
      });
    }
  }
  return due;
}

/**
 * Return all Due Cards across every deck (deck-übergreifend). Used by the
 * Tag-Session-Picker (issue #7) — feeds the domain helpers
 * `listTagsWithDueCounts` and `dueCardsForTagAnd`.
 *
 * Like `listDueCardsInDeck`, this performs an N+1 read (one review-state
 * lookup per card). For the v1 size budget that's acceptable; if the corpus
 * grows beyond a few thousand cards we can switch to a dexie multi-key range
 * query on `reviewStates.nextDue`.
 */
export async function listAllDueCards(now: number): Promise<Card[]> {
  const cardRows = await db.cards.toArray();
  const due: Card[] = [];
  for (const cardRow of cardRows) {
    const state = await getReviewState(cardRow.id);
    if (isDue(state, now)) {
      due.push({
        id: cardRow.id,
        deckId: cardRow.deckId,
        front: cardRow.front,
        back: cardRow.back,
        tags: [...(cardRow.tags ?? [])],
      });
    }
  }
  return due;
}
