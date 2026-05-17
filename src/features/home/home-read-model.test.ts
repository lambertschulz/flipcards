import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckSetInDb } from "@/db/deck-sets";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import type { Deck } from "@/domain/deck";
import { INITIAL_REVIEW_STATE, type ReviewState } from "@/domain/sm2";
import {
  computeDecksWithCounts,
  computeHomeSummary,
  listDeckSets,
  listDecksWithDueCounts,
  loadHomeSummary,
} from "@/features/home/home-read-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const NOW = 1_700_000_000_000;
const FUTURE: ReviewState = {
  repetitions: 1,
  easeFactor: 2.5,
  intervalDays: 5,
  nextDue: NOW + 5 * 24 * 60 * 60 * 1000,
};
const PAST: ReviewState = {
  repetitions: 1,
  easeFactor: 2.5,
  intervalDays: 1,
  nextDue: NOW - 1,
};

function deck(id: string, name: string, deckSetId?: string): Deck {
  return deckSetId === undefined ? { id, name } : { id, name, deckSetId };
}

describe("computeDecksWithCounts (pure)", () => {
  it("counts due and total per deck, defaulting unknown cards to due", () => {
    const decks: Deck[] = [deck("d1", "Alpha"), deck("d2", "Beta")];
    const cards = [
      { id: "c1", deckId: "d1" },
      { id: "c2", deckId: "d1" },
      { id: "c3", deckId: "d1" },
      { id: "c4", deckId: "d2" },
    ];
    const states = new Map<string, ReviewState>([
      ["c1", PAST],
      ["c2", FUTURE],
      // c3 unseen → defaults to INITIAL_REVIEW_STATE (nextDue=0) → due
      // c4 unseen → due
    ]);
    const lookup = (id: string) => states.get(id) ?? INITIAL_REVIEW_STATE;

    const result = computeDecksWithCounts(decks, cards, lookup, NOW);

    expect(result).toEqual([
      { id: "d1", name: "Alpha", dueCount: 2, totalCount: 3 },
      { id: "d2", name: "Beta", dueCount: 1, totalCount: 1 },
    ]);
  });

  it("returns zero counts for a deck with no cards", () => {
    const result = computeDecksWithCounts(
      [deck("d1", "Empty")],
      [],
      () => INITIAL_REVIEW_STATE,
      NOW,
    );
    expect(result).toEqual([{ id: "d1", name: "Empty", dueCount: 0, totalCount: 0 }]);
  });
});

describe("computeHomeSummary (pure)", () => {
  it("sums due cards and counts distinct decks contributing", () => {
    const cards = [
      { id: "c1", deckId: "d1" },
      { id: "c2", deckId: "d1" },
      { id: "c3", deckId: "d2" },
      { id: "c4", deckId: "d3" },
    ];
    const states = new Map<string, ReviewState>([
      ["c1", PAST],
      ["c2", PAST],
      ["c3", FUTURE],
      ["c4", PAST],
    ]);
    const lookup = (id: string) => states.get(id) ?? INITIAL_REVIEW_STATE;

    const summary = computeHomeSummary(cards, lookup, NOW);

    expect(summary).toEqual({ totalDue: 3, decksWithDue: 2 });
  });

  it("returns zeros when no cards are due", () => {
    const cards = [{ id: "c1", deckId: "d1" }];
    const lookup = () => FUTURE;
    expect(computeHomeSummary(cards, lookup, NOW)).toEqual({ totalDue: 0, decksWithDue: 0 });
  });
});

describe("Dexie loaders", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
  });

  it("listDecksWithDueCounts integrates Dexie and review-state", async () => {
    const d1 = await createDeckInDb({ name: "Vokabeln" });
    const d2 = await createDeckInDb({ name: "Anatomie" });
    const c1 = await createCardInDb({ deckId: d1.id, front: "f1", back: "b1" });
    const c2 = await createCardInDb({ deckId: d1.id, front: "f2", back: "b2" });
    await createCardInDb({ deckId: d2.id, front: "f3", back: "b3" });
    // c1 scheduled in the future (not due), c2/c3 have no state → due
    await putReviewState(c1.id, FUTURE);
    await putReviewState(c2.id, PAST);

    const result = await listDecksWithDueCounts(NOW);

    // Sorted alphabetically: Anatomie before Vokabeln.
    expect(result.map((d) => d.name)).toEqual(["Anatomie", "Vokabeln"]);
    const anatomie = result.find((d) => d.id === d2.id);
    const vokabeln = result.find((d) => d.id === d1.id);
    expect(anatomie).toMatchObject({ totalCount: 1, dueCount: 1 });
    expect(vokabeln).toMatchObject({ totalCount: 2, dueCount: 1 });
  });

  it("listDeckSets returns sets sorted alphabetically", async () => {
    await createDeckSetInDb({ name: "Zoologie" });
    await createDeckSetInDb({ name: "Algebra" });
    const sets = await listDeckSets();
    expect(sets.map((s) => s.name)).toEqual(["Algebra", "Zoologie"]);
  });

  it("loadHomeSummary aggregates across decks", async () => {
    const d1 = await createDeckInDb({ name: "A" });
    const d2 = await createDeckInDb({ name: "B" });
    const c1 = await createCardInDb({ deckId: d1.id, front: "f", back: "b" });
    await createCardInDb({ deckId: d2.id, front: "f", back: "b" });
    await putReviewState(c1.id, FUTURE);
    // c2 unseen → due

    const summary = await loadHomeSummary(NOW);
    expect(summary).toEqual({ totalDue: 1, decksWithDue: 1 });
  });
});
