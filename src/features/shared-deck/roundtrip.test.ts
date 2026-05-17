// Headline AC of issue #22:
//
//   "Round-Trip-Test: Export → Import in „leeres" Setup → identische Cards
//   + Tags, alle Cards sofort due (keine Review-States)."
//
// We exercise the full vertical: real Dexie (via fake-indexeddb), the
// `collect → stringify → parse → applySharedDeckImport` pipeline, with a
// DB-wipe between halves to simulate "leeres Setup".

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import { parseSharedDeck, stringifySharedDeck } from "@/domain/shared-deck";

import { applySharedDeckImport } from "./apply";
import { collectSharedDeck } from "./collect";

const fixedClock = { now: () => new Date("2026-05-17T08:00:00Z") };

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("SharedDeck round-trip (issue #22 headline AC)", () => {
  it("Export → wipe → Import yields identical cards + tags, all cards due", async () => {
    // Seed: deck + cards + a review-state. The review-state must NOT travel.
    await db.decks.add({ id: "deck-share001", name: "Französisch", description: "A2" });
    await db.cards.bulkAdd([
      {
        id: "card-share001",
        deckId: "deck-share001",
        front: "bonjour",
        back: "hallo",
        tags: ["fr", "easy"],
      },
      { id: "card-share002", deckId: "deck-share001", front: "ouïe", back: "Gehör", tags: ["fr"] },
    ]);
    await db.reviewStates.add({
      cardId: "card-share001",
      repetitions: 3,
      easeFactor: 2.7,
      intervalDays: 8,
      nextDue: 1_715_900_000_000,
    });

    const file = await collectSharedDeck("deck-share001", fixedClock);
    // Sanity: no review-state shipped.
    expect("reviewStates" in file).toBe(false);

    const json = stringifySharedDeck(file);

    // Wipe to simulate a "leeres Setup".
    await db.decks.clear();
    await db.cards.clear();
    await db.reviewStates.clear();

    const parsed = parseSharedDeck(json);
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.error)}`);
    const summary = await applySharedDeckImport(parsed.value);

    expect(summary.mode).toBe("new");
    expect(summary.cardsAdded).toBe(2);

    const deck = await db.decks.get("deck-share001");
    expect(deck?.name).toBe("Französisch");
    expect(deck?.description).toBe("A2");

    const cards = (await db.cards.where("deckId").equals("deck-share001").toArray()).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    expect(cards).toEqual([
      {
        id: "card-share001",
        deckId: "deck-share001",
        front: "bonjour",
        back: "hallo",
        tags: ["fr", "easy"],
      },
      {
        id: "card-share002",
        deckId: "deck-share001",
        front: "ouïe",
        back: "Gehör",
        tags: ["fr"],
      },
    ]);

    // Per CONTEXT.md, cards without a review-state are immediately due.
    const states = await db.reviewStates.toArray();
    expect(states).toHaveLength(0);
  });
});
