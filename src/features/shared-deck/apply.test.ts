// ADR-0011 (Shared-Deck-Import) is the spec these tests pin down:
//   1. Deck-ID match → additive merge per card-ID; local wins on duplicates.
//   2. Name collision without ID match → import gets a "(N)" suffix.
//   3. No match → fresh import.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import { SHARED_DECK_FORMAT, type SharedDeck } from "@/domain/shared-deck";
import { applySharedDeckImport } from "./apply";

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function makeFile(overrides: Partial<SharedDeck> = {}): SharedDeck {
  return {
    format: SHARED_DECK_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-05-17T08:00:00Z",
    deck: { id: "deck-shared01", name: "Französisch", description: "Vokabeln" },
    cards: [
      { id: "card-share001", front: "bonjour", back: "hallo", tags: ["fr"] },
      { id: "card-share002", front: "au revoir", back: "tschüss", tags: [] },
    ],
    ...overrides,
  };
}

describe("applySharedDeckImport — fresh import", () => {
  it("creates the deck and all cards verbatim when no local deck has the ID or name", async () => {
    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("new");
    expect(summary.cardsAdded).toBe(2);
    expect(summary.cardsSkipped).toBe(0);

    const deck = await db.decks.get("deck-shared01");
    expect(deck?.name).toBe("Französisch");
    expect(deck?.description).toBe("Vokabeln");
    const cards = await db.cards.where("deckId").equals("deck-shared01").toArray();
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.id === "card-share001")?.tags).toEqual(["fr"]);
  });
});

describe("applySharedDeckImport — ID match (additive merge)", () => {
  it("adds only the cards not already present and leaves local content untouched", async () => {
    // Local: same deck-id, with one card whose id ALSO appears in the file.
    // The local card has different content — the merge must NOT overwrite it.
    await db.decks.add({ id: "deck-shared01", name: "Existing local name" });
    await db.cards.add({
      id: "card-share001",
      deckId: "deck-shared01",
      front: "LOCAL FRONT",
      back: "LOCAL BACK",
      tags: ["local"],
    });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("merged");
    expect(summary.cardsAdded).toBe(1); // only card-share002 is new
    expect(summary.cardsSkipped).toBe(1);

    // Local card content preserved.
    const local = await db.cards.get("card-share001");
    expect(local?.front).toBe("LOCAL FRONT");
    expect(local?.tags).toEqual(["local"]);

    // Newly-added card landed.
    const added = await db.cards.get("card-share002");
    expect(added?.front).toBe("au revoir");

    // Deck metadata stays as it was locally — name and (missing) description.
    const deck = await db.decks.get("deck-shared01");
    expect(deck?.name).toBe("Existing local name");
    expect(deck?.description).toBeUndefined();
  });
});

describe("applySharedDeckImport — name collision (suffix)", () => {
  it('renames the import to "Name (2)" when a local deck with a different ID has the same name', async () => {
    await db.decks.add({ id: "deck-different", name: "Französisch" });

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("renamed");
    expect(summary.deckName).toBe("Französisch (2)");

    const imported = await db.decks.get("deck-shared01");
    expect(imported?.name).toBe("Französisch (2)");
  });

  it('counts up "(3)", "(4)" as collisions accumulate', async () => {
    await db.decks.bulkAdd([
      { id: "d1", name: "Französisch" },
      { id: "d2", name: "Französisch (2)" },
    ]);

    const summary = await applySharedDeckImport(makeFile());

    expect(summary.mode).toBe("renamed");
    expect(summary.deckName).toBe("Französisch (3)");
  });
});

describe("applySharedDeckImport — frisch importierte Cards sind sofort due", () => {
  it("does not write any review-state on import (cards are due by CONTEXT.md)", async () => {
    await applySharedDeckImport(makeFile());

    // Per CONTEXT.md "Due Card": cards without a review-state are due.
    // We assert by checking the reviewStates table contains no rows for
    // the imported card ids.
    const states = await db.reviewStates.toArray();
    expect(states).toHaveLength(0);
  });
});
