import Dexie, { type EntityTable } from "dexie";

/**
 * Skeleton schemas — feature tickets extend these via `db.version(2)` etc.
 * See ADR-0016 (Versions-Achsen) and CONTEXT.md for the language used here.
 */

export interface DeckRow {
  id: string;
  name: string;
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
}

export interface ReviewStateRow {
  cardId: string;
  due: number;
}

export class FlipcardsDatabase extends Dexie {
  decks!: EntityTable<DeckRow, "id">;
  deckSets!: EntityTable<DeckSetRow, "id">;
  cards!: EntityTable<CardRow, "id">;
  reviewStates!: EntityTable<ReviewStateRow, "cardId">;

  constructor() {
    super("flipcards");

    this.version(1).stores({
      decks: "id, deckSetId, name",
      deckSets: "id, name",
      cards: "id, deckId",
      reviewStates: "cardId, due",
    });
  }
}

export const db = new FlipcardsDatabase();
