import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { FlipcardsDatabase, type ReviewStateRow } from "@/db/database";

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
  // DB, then re-opening it under the full schema and asserting the upgrade
  // produced canonical SM-2 rows. If anyone touches the upgrade hooks, this
  // test breaks loudly.
  it("upgrades pre-v2 rows: backfills missing tags and renames due → nextDue", async () => {
    const dbName = "flipcards-migration-fixture";

    // Step 1 — open as v1 only and seed legacy rows. We use a plain Dexie
    // instance with the *historical* v1 schema (no *tags index, `due` instead
    // of `nextDue`). This is the fixture; it represents what a user on an
    // older app version would have on disk.
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

    // Step 2 — re-open under the full schema. Dexie should run v1→v2 (add
    // tags index + backfill empty array) and v2→v3 (rename `due` → `nextDue`
    // + seed SM-2 defaults) automatically.
    const upgraded = new Dexie(dbName);
    upgraded.version(1).stores({
      decks: "id, deckSetId, name",
      deckSets: "id, name",
      cards: "id, deckId",
      reviewStates: "cardId, due",
    });
    upgraded
      .version(2)
      .stores({ cards: "id, deckId, *tags" })
      .upgrade(async (tx) => {
        await tx
          .table("cards")
          .toCollection()
          .modify((card: { tags?: string[] }) => {
            if (!Array.isArray(card.tags)) card.tags = [];
          });
      });
    upgraded
      .version(3)
      .stores({
        reviewStates: "cardId, nextDue",
        reviews: "id, cardId, timestamp",
      })
      .upgrade(async (tx) => {
        await tx
          .table("reviewStates")
          .toCollection()
          .modify((row: ReviewStateRow & { due?: number }) => {
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
    await upgraded.open();

    const card = await upgraded.table("cards").get("card-legacy");
    expect(card.tags).toEqual([]);

    const reviewState = await upgraded.table("reviewStates").get("card-legacy");
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
