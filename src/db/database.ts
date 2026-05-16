import Dexie, { type EntityTable } from "dexie";

/**
 * Skeleton schemas — feature tickets extend these via `db.version(2)` etc.
 * See ADR-0016 (Versions-Achsen) and CONTEXT.md for the language used here.
 */

export interface DeckRow {
  id: string;
  name: string;
  description?: string;
  deckSetId?: string;
}

export interface DeckSetRow {
  id: string;
  name: string;
}

export interface CardRow {
  id: string;
  deckId: string;
  front: string;
  back: string;
  tags: string[];
}

export interface ReviewStateRow {
  cardId: string;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextDue: number;
}

export interface ReviewLogRow {
  id: string;
  cardId: string;
  timestamp: number;
  rating: "again" | "hard" | "good" | "easy";
  intervalAfter: number;
  easeAfter: number;
}

export class FlipcardsDatabase extends Dexie {
  decks!: EntityTable<DeckRow, "id">;
  deckSets!: EntityTable<DeckSetRow, "id">;
  cards!: EntityTable<CardRow, "id">;
  reviewStates!: EntityTable<ReviewStateRow, "cardId">;
  reviews!: EntityTable<ReviewLogRow, "id">;

  constructor() {
    super("flipcards");

    this.version(1).stores({
      decks: "id, deckSetId, name",
      deckSets: "id, name",
      cards: "id, deckId",
      reviewStates: "cardId, due",
    });

    // v2 — card tags become first-class (issue #5 card-editor). `*tags` is a
    // multi-entry index so tag-sessions (issue #7) can query cards by tag
    // without a full scan. Backfill: pre-v2 cards lacked the field at all.
    this.version(2)
      .stores({
        cards: "id, deckId, *tags",
      })
      .upgrade(async (tx) => {
        await tx
          .table<CardRow>("cards")
          .toCollection()
          .modify((card) => {
            if (!Array.isArray(card.tags)) card.tags = [];
          });
      });

    // v3 — full SM-2 review-state per ADR-0002 + the review-log table from
    // ADR-0012. Pre-v3 the reviewStates row only held `{cardId, due}`; the
    // upgrade promotes `due` to `nextDue` and seeds the missing SM-2 fields
    // with the canonical defaults (treats partial rows as "fresh" cards).
    this.version(3)
      .stores({
        reviewStates: "cardId, nextDue",
        reviews: "id, cardId, timestamp",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ReviewStateRow & { due?: number }>("reviewStates")
          .toCollection()
          .modify((row) => {
            const legacyDue = row.due;
            if (legacyDue !== undefined) {
              row.nextDue = legacyDue;
              row.due = undefined;
            }
            if (row.nextDue === undefined) row.nextDue = 0;
            if (row.repetitions === undefined) row.repetitions = 0;
            if (row.easeFactor === undefined) row.easeFactor = 2.5;
            if (row.intervalDays === undefined) row.intervalDays = 0;
          });
      });
  }
}

export const db = new FlipcardsDatabase();
