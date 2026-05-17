// ADR-0011 (Shared-Deck-Set-Import) is the spec these tests pin down.
//
// Set wrapper:
//   • ID match    → keep local set, additive union of member-ids.
//   • Name match  → suffix the imported set name.
//   • Else        → fresh set.
//
// Each contained deck follows the Shared-Deck rules (merge / rename /
// new). Set membership:
//   • lose deck                 → adopted into imported set.
//   • deck already in some set  → stays there, NOT under imported set.
//   • newly-added deck          → joins imported set.
//
// Card-ID collisions are global; review-state and review-log orphan rows
// are purged for every card the import adds.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import { SHARED_DECK_SET_FORMAT, type SharedDeckSet } from "@/domain/shared-deck";

import { applySharedDeckSetImport } from "./apply";

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function makeFile(overrides: Partial<SharedDeckSet> = {}): SharedDeckSet {
  return {
    format: SHARED_DECK_SET_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-05-17T08:00:00Z",
    deckSet: { id: "set-shareset01", name: "Sprachen", description: "Reisen" },
    decks: [
      {
        id: "deck-shareset01",
        name: "Französisch",
        description: "A2",
        cards: [
          { id: "card-shareset01", front: "bonjour", back: "hallo", tags: ["fr"] },
          { id: "card-shareset02", front: "au revoir", back: "tschüss", tags: [] },
        ],
      },
      {
        id: "deck-shareset02",
        name: "Italienisch",
        cards: [{ id: "card-shareset03", front: "buongiorno", back: "guten Tag", tags: ["it"] }],
      },
    ],
    ...overrides,
  };
}

describe("applySharedDeckSetImport — fresh import", () => {
  it("creates the set, all decks, all cards verbatim when nothing local matches", async () => {
    const summary = await applySharedDeckSetImport(makeFile());

    expect(summary.setMode).toBe("new");
    expect(summary.setName).toBe("Sprachen");
    expect(summary.decks).toHaveLength(2);
    expect(summary.decks.every((d) => d.mode === "new")).toBe(true);
    expect(summary.decks.every((d) => d.joinedSet)).toBe(true);

    const set = await db.deckSets.get("set-shareset01");
    expect(set?.name).toBe("Sprachen");
    expect(set?.description).toBe("Reisen");

    const decks = await db.decks.where("deckSetId").equals("set-shareset01").toArray();
    expect(decks).toHaveLength(2);

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(3);
    expect(cards.find((c) => c.id === "card-shareset01")?.tags).toEqual(["fr"]);
  });
});

describe("applySharedDeckSetImport — set ID match (additive)", () => {
  it("keeps the local set metadata and adds new member decks alongside the existing ones", async () => {
    await db.deckSets.add({ id: "set-shareset01", name: "Existing Local Name" });
    // A pre-existing member deck under this set, NOT mentioned in the import.
    await db.decks.add({
      id: "deck-localpre001",
      name: "Vorhandenes Deck",
      deckSetId: "set-shareset01",
    });

    const summary = await applySharedDeckSetImport(makeFile());

    expect(summary.setMode).toBe("merged");
    expect(summary.setName).toBe("Existing Local Name");

    // Both new decks joined the existing set.
    const members = await db.decks.where("deckSetId").equals("set-shareset01").toArray();
    const memberIds = members.map((m) => m.id).sort();
    expect(memberIds).toEqual(["deck-localpre001", "deck-shareset01", "deck-shareset02"]);

    // Set metadata preserved (local wins).
    const set = await db.deckSets.get("set-shareset01");
    expect(set?.name).toBe("Existing Local Name");
  });
});

describe("applySharedDeckSetImport — set name collision (suffix)", () => {
  it('renames the import to "Name (2)" when a local set with a different ID has the same name', async () => {
    await db.deckSets.add({ id: "set-different", name: "Sprachen" });

    const summary = await applySharedDeckSetImport(makeFile());

    expect(summary.setMode).toBe("renamed");
    expect(summary.setName).toBe("Sprachen (2)");

    const set = await db.deckSets.get("set-shareset01");
    expect(set?.name).toBe("Sprachen (2)");
  });
});

describe("applySharedDeckSetImport — per-deck merge", () => {
  it("merges cards into the existing deck and keeps local content untouched", async () => {
    // Pre-existing deck with the same ID as one in the import, AND one of
    // the import's cards already exists locally with different content.
    await db.decks.add({ id: "deck-shareset01", name: "Lokaler Name" });
    await db.cards.add({
      id: "card-shareset01",
      deckId: "deck-shareset01",
      front: "LOCAL FRONT",
      back: "LOCAL BACK",
      tags: ["local"],
    });

    const summary = await applySharedDeckSetImport(makeFile());

    const merged = summary.decks.find((d) => d.deckId === "deck-shareset01");
    expect(merged?.mode).toBe("merged");
    expect(merged?.cardsAdded).toBe(1); // only card-shareset02 was new
    expect(merged?.cardsSkipped).toBe(1);

    // Local card content preserved.
    const local = await db.cards.get("card-shareset01");
    expect(local?.front).toBe("LOCAL FRONT");

    // Local deck name preserved.
    const deck = await db.decks.get("deck-shareset01");
    expect(deck?.name).toBe("Lokaler Name");
  });
});

describe("applySharedDeckSetImport — deck name collision", () => {
  it('suffixes the import deck name to "(2)" when another local deck has the same name', async () => {
    await db.decks.add({ id: "deck-other", name: "Französisch" });

    const summary = await applySharedDeckSetImport(makeFile());

    const renamed = summary.decks.find((d) => d.deckId === "deck-shareset01");
    expect(renamed?.mode).toBe("renamed");
    expect(renamed?.deckName).toBe("Französisch (2)");

    const stored = await db.decks.get("deck-shareset01");
    expect(stored?.name).toBe("Französisch (2)");
  });
});

describe("applySharedDeckSetImport — set membership (ADR-0011)", () => {
  it("adopts locally-lose decks into the imported set", async () => {
    await db.decks.add({ id: "deck-shareset01", name: "Lose lokal" });

    const summary = await applySharedDeckSetImport(makeFile());

    const result = summary.decks.find((d) => d.deckId === "deck-shareset01");
    expect(result?.joinedSet).toBe(true);

    const deck = await db.decks.get("deck-shareset01");
    expect(deck?.deckSetId).toBe("set-shareset01");
  });

  it("leaves decks that already belong to another set alone (NOT listed under imported set)", async () => {
    await db.deckSets.add({ id: "set-otherset", name: "Anderes Set" });
    await db.decks.add({
      id: "deck-shareset01",
      name: "Vorhandenes Deck",
      deckSetId: "set-otherset",
    });

    const summary = await applySharedDeckSetImport(makeFile());

    const result = summary.decks.find((d) => d.deckId === "deck-shareset01");
    expect(result?.joinedSet).toBe(false);

    const deck = await db.decks.get("deck-shareset01");
    expect(deck?.deckSetId).toBe("set-otherset");

    // The imported set exists but the conflict-deck is NOT under it.
    const members = await db.decks.where("deckSetId").equals("set-shareset01").toArray();
    expect(members.map((m) => m.id)).toEqual(["deck-shareset02"]);
  });
});

describe("applySharedDeckSetImport — orphan review-row purge (review gap from PR #51)", () => {
  it("purges orphan reviewStates rows for newly-added card ids", async () => {
    // Stale reviewState for a card-id the import will (re-)introduce.
    await db.reviewStates.add({
      cardId: "card-shareset01",
      repetitions: 5,
      easeFactor: 2.8,
      intervalDays: 30,
      nextDue: 1_715_000_000_000,
    });

    await applySharedDeckSetImport(makeFile());

    const states = await db.reviewStates.toArray();
    expect(states).toHaveLength(0);
  });

  it("purges orphan review-log rows for newly-added card ids", async () => {
    // Stale review-log row.
    await db.reviews.add({
      id: "rev-orphan-aaaaaaaa",
      cardId: "card-shareset01",
      timestamp: 1_715_000_000_000,
      rating: "good",
      intervalAfter: 4,
      easeAfter: 2.5,
    });
    // Untouched log for a card the import does NOT introduce.
    await db.reviews.add({
      id: "rev-keepme-bbbbbbbb",
      cardId: "card-elsewhere",
      timestamp: 1_715_000_000_001,
      rating: "easy",
      intervalAfter: 8,
      easeAfter: 2.6,
    });

    await applySharedDeckSetImport(makeFile());

    const remaining = await db.reviews.toArray();
    expect(remaining.map((r) => r.id)).toEqual(["rev-keepme-bbbbbbbb"]);
  });
});

describe("applySharedDeckSetImport — global card-ID collision", () => {
  it("skips imported cards whose id already exists in any other deck (data-loss guard)", async () => {
    // A card with the same id lives in some unrelated deck locally.
    await db.decks.add({ id: "deck-unrelated", name: "Unrelated" });
    await db.cards.add({
      id: "card-shareset01",
      deckId: "deck-unrelated",
      front: "UNRELATED",
      back: "STAYS",
      tags: [],
    });

    const summary = await applySharedDeckSetImport(makeFile());

    const fresh = summary.decks.find((d) => d.deckId === "deck-shareset01");
    expect(fresh?.cardsAdded).toBe(1); // only card-shareset02 went in
    expect(fresh?.cardsSkipped).toBe(1);

    // The unrelated card was NOT overwritten.
    const unrelated = await db.cards.get("card-shareset01");
    expect(unrelated?.deckId).toBe("deck-unrelated");
    expect(unrelated?.front).toBe("UNRELATED");
  });
});

describe("applySharedDeckSetImport — in-file card-id collision (ADR-0018)", () => {
  // ADR-0018 allows the SAME card-id to appear in two decks within a single
  // SharedDeckSet file. The Dexie `cards` table primary key is unique, so
  // only the FIRST occurrence can land; the importer keeps that one and
  // surfaces the count separately in the summary so the user knows.
  it("imports the first occurrence, skips the second, and reports the count in the summary", async () => {
    const file = makeFile();
    // Inject card-shareset01 (already in deck 0) into deck 1 as well — same
    // id, different front/back to make the "first wins" assertion sharp.
    file.decks[1].cards = [
      { id: "card-shareset01", front: "SECOND OCCURRENCE", back: "lose", tags: [] },
      ...file.decks[1].cards,
    ];

    const summary = await applySharedDeckSetImport(file);

    // Import succeeded.
    expect(summary.setMode).toBe("new");
    expect(summary.cardsSkippedDueToInFileCollision).toBe(1);

    // First occurrence (from deck 0) is the one that landed.
    const stored = await db.cards.get("card-shareset01");
    expect(stored?.front).toBe("bonjour");
    expect(stored?.deckId).toBe("deck-shareset01");

    // Deck 1's per-deck summary records the skip.
    const deck1 = summary.decks.find((d) => d.deckId === "deck-shareset02");
    expect(deck1?.cardsAdded).toBe(1); // only the original Italian card
    expect(deck1?.cardsSkipped).toBe(1); // the duplicate-id was skipped
  });
});
