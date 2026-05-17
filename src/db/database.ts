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
  // Provenance fields for decks imported from the Curated-Decks bundle
  // (ADR-0010). `curatedSourceId` is the stable cross-version identifier
  // assigned by the curator; `contentVersion` is the monotonically
  // increasing release counter. Together they let a future "Update
  // verfügbar" UX detect that a re-imported bundle entry is newer than the
  // one already in IndexedDB without re-fetching the payload.
  //
  // Both are optional: decks the user created locally or imported from a
  // peer-shared file have neither. v1 does not surface these fields in the
  // UI; they exist so the migration path to ADR-0010's update-detection
  // story is non-breaking.
  curatedSourceId?: string;
  contentVersion?: number;
}

export interface DeckSetRow {
  id: string;
  name: string;
  description?: string;
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

    // v4 — deck-sets gain an optional `description` (issue #19 Deck-Set-CRUD).
    // The new field is purely additive; rows without it are valid because the
    // column is optional. No `stores()` change is needed (description is not
    // indexed), but the explicit version() bump pins the schema so future
    // migrations have a clean predecessor to upgrade from.
    this.version(4).stores({
      deckSets: "id, name",
    });

    // v5 — decks gain optional provenance fields `curatedSourceId` and
    // `contentVersion` for Curated-Deck imports (issue #24, ADR-0010). Both
    // are unindexed and optional — no `stores()` change needed. Pre-v5 rows
    // simply lack the fields, which is valid for the row type and a no-op
    // upgrade path.
    this.version(5).stores({
      decks: "id, deckSetId, name",
    });
  }
}

export const db = new FlipcardsDatabase();
