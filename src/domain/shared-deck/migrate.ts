// Versioned migration pipeline for Shared-Deck / Shared-Deck-Set JSON.
// In v1 the migration tables are empty — both formats start at version 1, so
// there is nothing older to lift forward yet. The module exists as the
// structural commitment from ADR-0016: a v2 schema bump adds an entry here
// and the importer keeps working without touching the parse pipeline.

import {
  CURRENT_SHARED_DECK_FORMAT_VERSION,
  CURRENT_SHARED_DECK_SET_FORMAT_VERSION,
} from "./schema";

type Migration = (input: unknown) => unknown;

const sharedDeckMigrations: Record<number, Migration> = {};
const sharedDeckSetMigrations: Record<number, Migration> = {};

export class NoMigrationError extends Error {
  readonly fromVersion: number;
  constructor(fromVersion: number, format: string) {
    super(`No migration available from ${format} formatVersion ${fromVersion}`);
    this.name = "NoMigrationError";
    this.fromVersion = fromVersion;
  }
}

function runChain(
  migrations: Record<number, Migration>,
  format: string,
  target: number,
  parsed: unknown,
  fromVersion: number,
): unknown {
  let current: unknown = parsed;
  let version = fromVersion;
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new NoMigrationError(version, format);
    current = step(current);
    version += 1;
  }
  return current;
}

export function migrateSharedDeck(parsed: unknown, fromVersion: number): unknown {
  return runChain(
    sharedDeckMigrations,
    "flipcards.shared-deck",
    CURRENT_SHARED_DECK_FORMAT_VERSION,
    parsed,
    fromVersion,
  );
}

export function migrateSharedDeckSet(parsed: unknown, fromVersion: number): unknown {
  return runChain(
    sharedDeckSetMigrations,
    "flipcards.shared-deck-set",
    CURRENT_SHARED_DECK_SET_FORMAT_VERSION,
    parsed,
    fromVersion,
  );
}
