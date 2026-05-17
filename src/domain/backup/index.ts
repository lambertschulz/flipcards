// Public API for parsing and emitting Backup JSON (ADR-0016 axis #4).
//
// Pipeline (mirrors `src/domain/shared-deck/`):
//   1. JSON.parse              → JsonSyntaxError on failure
//   2. discriminate on `format`→ UnknownFormat with expected/actual
//   3. check `formatVersion`   → IncompatibleVersion if newer; migrate if older
//   4. Zod-validate            → SchemaError carrying zod issues
//
// No throws. Every failure mode is reachable as a discriminated `BackupError`
// variant so the import UI can render targeted messages.

import type { z } from "zod";

import { APP_VERSION } from "@/lib/app-version";

import { NoMigrationError, migrateBackup } from "./migrate";
import {
  BACKUP_FORMAT,
  type BackupFileV1,
  BackupFileV1Schema,
  CURRENT_BACKUP_FORMAT_VERSION,
} from "./schema";

export type {
  BackupDeck,
  BackupDeckSet,
  BackupFileV1,
  BackupReviewState,
} from "./schema";
export { BACKUP_FORMAT, CURRENT_BACKUP_FORMAT_VERSION } from "./schema";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type BackupError =
  | { kind: "JsonSyntaxError"; message: string }
  | { kind: "UnknownFormat"; expected: string; actual: unknown }
  | {
      kind: "IncompatibleVersion";
      expected: number;
      actual: unknown;
      direction: "newer" | "older-no-migration";
    }
  | { kind: "SchemaError"; issues: z.core.$ZodIssue[] };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

function readHeader(parsed: unknown): { format: unknown; formatVersion: unknown } {
  if (parsed === null || typeof parsed !== "object") {
    return { format: undefined, formatVersion: undefined };
  }
  const record = parsed as Record<string, unknown>;
  return { format: record.format, formatVersion: record.formatVersion };
}

export function parseBackup(json: string): Result<BackupFileV1, BackupError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return err({ kind: "JsonSyntaxError", message: e instanceof Error ? e.message : String(e) });
  }

  const header = readHeader(parsed);
  if (header.format !== BACKUP_FORMAT) {
    return err({ kind: "UnknownFormat", expected: BACKUP_FORMAT, actual: header.format });
  }

  const version = header.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return err({
      kind: "IncompatibleVersion",
      expected: CURRENT_BACKUP_FORMAT_VERSION,
      actual: version,
      direction: "older-no-migration",
    });
  }
  if (version > CURRENT_BACKUP_FORMAT_VERSION) {
    return err({
      kind: "IncompatibleVersion",
      expected: CURRENT_BACKUP_FORMAT_VERSION,
      actual: version,
      direction: "newer",
    });
  }

  let migrated: unknown = parsed;
  if (version < CURRENT_BACKUP_FORMAT_VERSION) {
    try {
      migrated = migrateBackup(parsed, version);
    } catch (e) {
      if (e instanceof NoMigrationError) {
        return err({
          kind: "IncompatibleVersion",
          expected: CURRENT_BACKUP_FORMAT_VERSION,
          actual: version,
          direction: "older-no-migration",
        });
      }
      throw e;
    }
  }

  const zodResult = BackupFileV1Schema.safeParse(migrated);
  if (!zodResult.success) {
    return err({ kind: "SchemaError", issues: zodResult.error.issues });
  }

  return ok(zodResult.data);
}

export type ExportBackupInput = {
  decks: BackupFileV1["decks"];
  deckSets: BackupFileV1["deckSets"];
  reviewStates: BackupFileV1["reviewStates"];
  /** Override `Date.now()` for deterministic tests. */
  now?: () => Date;
};

// Always writes the **current** format with the current `formatVersion`.
// There is intentionally no "export-version chooser" UX — ADR-0016 made that
// call explicit.
export function exportBackup(input: ExportBackupInput): BackupFileV1 {
  const now = (input.now ?? (() => new Date()))();
  return {
    format: BACKUP_FORMAT,
    formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    appVersion: APP_VERSION,
    decks: input.decks,
    deckSets: input.deckSets,
    reviewStates: input.reviewStates,
  };
}

export function stringifyBackup(file: BackupFileV1): string {
  return JSON.stringify(file);
}
