import "fake-indexeddb/auto";
import { FlipcardsDatabase } from "@/db/database";
import { afterEach, describe, expect, it } from "vitest";

describe("FlipcardsDatabase", () => {
  let instance: FlipcardsDatabase | null = null;

  afterEach(async () => {
    if (instance) {
      await instance.delete();
      instance = null;
    }
  });

  it("opens at the current schema version with the four entity stores", async () => {
    instance = new FlipcardsDatabase();
    await instance.open();

    expect(instance.verno).toBe(4);
    expect(instance.tables.map((t) => t.name).sort()).toEqual([
      "cards",
      "deckSets",
      "decks",
      "reviewStates",
      "reviews",
    ]);
  });
});
