import { describe, expect, it } from "vitest";

import type { BackupError } from "@/domain/backup";

import { describeBackupError } from "./error-messages";

describe("describeBackupError", () => {
  it("explicitly mentions the missing formatVersion field (ticket AC)", () => {
    const e: BackupError = {
      kind: "IncompatibleVersion",
      expected: 1,
      actual: undefined,
      direction: "older-no-migration",
    };
    expect(describeBackupError(e)).toMatch(/formatVersion/);
  });

  it("calls out a newer-than-supported version with an upgrade hint", () => {
    const e: BackupError = {
      kind: "IncompatibleVersion",
      expected: 1,
      actual: 2,
      direction: "newer",
    };
    expect(describeBackupError(e)).toMatch(/aktualisieren/i);
  });

  it("explains a missing `format` field", () => {
    const e: BackupError = {
      kind: "UnknownFormat",
      expected: "flipcards.backup",
      actual: undefined,
    };
    expect(describeBackupError(e)).toMatch(/format/i);
  });

  it("renders a Schema-Error with the first issue paths", () => {
    const e: BackupError = {
      kind: "SchemaError",
      issues: [
        { code: "custom", path: ["decks", 0, "id"], message: "bad id", input: null } as never,
      ],
    };
    const msg = describeBackupError(e);
    expect(msg).toMatch(/decks\.0\.id/);
    expect(msg).toMatch(/bad id/);
  });
});
