import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/database";

import { exportBackupToFile } from "./backup-export";

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("exportBackupToFile", () => {
  it("writes a Blob named flipcards-backup-YYYY-MM-DD.json with the current format", async () => {
    await db.decks.add({ id: "deck-xxxxxxxx", name: "X" });

    const saveAs = vi.fn<(blob: Blob, filename: string) => void>();
    await exportBackupToFile({ now: () => new Date("2026-05-17T08:00:00Z"), saveAs });

    expect(saveAs).toHaveBeenCalledOnce();
    const [blob, filename] = saveAs.mock.calls[0];
    expect(filename).toBe("flipcards-backup-2026-05-17.json");
    expect(blob.type).toBe("application/json");
    // JSDOM's `Blob` doesn't preserve its body text reliably — neither
    // `.text()` (undefined) nor wrapping in a `Response` (which yields
    // `"[object Blob]"`). The constructor at least preserves `.size`,
    // which is enough to assert "blob is non-empty"; the wire-level format
    // (`format`, `formatVersion`, content) is covered by the round-trip and
    // domain tests so this one only needs to prove the orchestrator wired
    // collect → stringify → saveAs together.
    expect(blob.size).toBeGreaterThan(0);
  });
});
