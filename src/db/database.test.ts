import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { FlipcardsDatabase } from "@/db/database";

// Thin subclass that pins the production constructor — same version
// declarations, same upgrade callbacks — under a separate DB name so the
// migration test can seed legacy data without colliding with the real
// "flipcards" DB used by other tests. If the migration callbacks in the
// parent class drift, this subclass picks it up automatically.
class MigrationFixtureDatabase extends FlipcardsDatabase {
  constructor(name: string) {
    super();
    // Rename after `super()` so all of the production `this.version(N)`
    // declarations are attached to the renamed DB. Dexie reads `this.name`
    // at open(), not at construction.
    Object.defineProperty(this, "name", { value: name, configurable: true });
  }
}

describe("FlipcardsDatabase", () => {
  let instance: FlipcardsDatabase | null = null;

  afterEach(async () => {
    if (instance) {
      await instance.delete();
      instance = null;
    }
    // Clean any side-Dexie instances the migration test opens.
    await Dexie.delete("flipcards-migration-fixture");
  });

  it("opens at the current schema version with the four entity stores", async () => {
    instance = new FlipcardsDatabase();
    await instance.open();

    expect(instance.verno).toBe(3);
    expect(instance.tables.map((t) => t.name).sort()).toEqual([
      "cards",
      "deckSets",
      "decks",
      "reviewStates",
      "reviews",
    ]);
  });

  // ADR-0016 axis #2: every Dexie schema bump ships with an upgrade-hook AND a
  // unit test of the upgrade path. This test pins down the v1 → v3 migration
  // by writing a pre-v2 fixture (no tags, legacy `due` column) into a side
  // DB, then re-opening under the *production* FlipcardsDatabase class — that
  // way the upgrade hooks under test are the same ones shipped to users. If
  // anyone touches them, this test breaks loudly.
  it("upgrades pre-v2 rows: backfills missing tags and renames due → nextDue", async () => {
    const dbName = "flipcards-migration-fixture";

    // Step 1 — open as v1 only and seed legacy rows. v1 is now history, so we
    // hand-roll the schema here; nothing in the production module still
    // describes it.
    const v1 = new Dexie(dbName);
    v1.version(1).stores({
      decks: "id, deckSetId, name",
      deckSets: "id, name",
      cards: "id, deckId",
      reviewStates: "cardId, due",
    });
    await v1.open();
    await v1.table("cards").add({
      id: "card-legacy",
      deckId: "deck-legacy",
      front: "alt",
      back: "old",
      // Note: deliberately no `tags` field — pre-v2 cards lacked it entirely.
    });
    await v1.table("reviewStates").add({ cardId: "card-legacy", due: 1_700_000_000_000 });
    v1.close();

    // Step 2 — re-open under the production schema. Dexie should run the real
    // v1→v2 and v2→v3 upgrade callbacks (defined in `database.ts`).
    const upgraded = new MigrationFixtureDatabase(dbName);
    await upgraded.open();

    expect(upgraded.verno).toBe(3);

    const card = await upgraded.cards.get("card-legacy");
    expect(card?.tags).toEqual([]);

    const reviewState = await upgraded.reviewStates.get("card-legacy");
    expect(reviewState).toEqual({
      cardId: "card-legacy",
      nextDue: 1_700_000_000_000,
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 0,
    });
    upgraded.close();
  });
});
