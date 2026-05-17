import { describe, expect, it } from "vitest";

import { backupFilename } from "./filename";

describe("backupFilename", () => {
  it("formats the date as YYYY-MM-DD in UTC", () => {
    expect(backupFilename(new Date("2026-05-17T08:30:00Z"))).toBe(
      "flipcards-backup-2026-05-17.json",
    );
  });

  it("zero-pads single-digit month and day", () => {
    expect(backupFilename(new Date("2026-01-02T00:00:00Z"))).toBe(
      "flipcards-backup-2026-01-02.json",
    );
  });
});
