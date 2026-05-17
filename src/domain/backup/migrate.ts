// Versioned migration pipeline for the Backup JSON format (ADR-0016 axis #4).
//
// In v1 the table is empty — the format starts at version 1, so there is
// nothing older to lift forward yet. The module exists as the structural
// commitment: when v2 ships, a `1 → 2` entry lands here and the parser keeps
// working without any other plumbing changes. Mirror of the shared-deck
// migration table on purpose; the two pipelines evolve independently but the
// shape stays familiar.

import { CURRENT_BACKUP_FORMAT_VERSION } from "./schema";

type Migration = (input: unknown) => unknown;

const backupMigrations: Record<number, Migration> = {
  // Example placement for the first real bump:
  //   1: (input) => addSettingsBlockDefaults(input as Record<string, unknown>),
  // A v2 schema module would then validate the result.
};

export class NoMigrationError extends Error {
  readonly fromVersion: number;
  constructor(fromVersion: number) {
    super(`No migration available from flipcards.backup formatVersion ${fromVersion}`);
    this.name = "NoMigrationError";
    this.fromVersion = fromVersion;
  }
}

export function migrateBackup(parsed: unknown, fromVersion: number): unknown {
  let current: unknown = parsed;
  let version = fromVersion;
  while (version < CURRENT_BACKUP_FORMAT_VERSION) {
    const step = backupMigrations[version];
    if (!step) throw new NoMigrationError(version);
    current = step(current);
    version += 1;
  }
  return current;
}
