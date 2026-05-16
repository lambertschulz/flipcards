// Public API for parsing/stringifying Shared-Deck and Shared-Deck-Set JSON.
//
// Pipeline (identical for both forms):
//   1. JSON.parse              → JsonSyntaxError on failure
//   2. discriminate on `format`→ UnknownFormat with expected/actual
//   3. check `formatVersion`   → IncompatibleVersion if newer; migrate if older
//   4. Zod-validate            → SchemaError carrying zod issues
//   5. semantic checks         → CardSizeError per ADR-0013
//
// No throws. Every failure mode is reachable as a discriminated `ImportError`
// variant so the import UI (#22) can render targeted messages.

import type { z } from "zod";

import { NoMigrationError, migrateSharedDeck, migrateSharedDeckSet } from "./migrate";
import {
  CURRENT_SHARED_DECK_FORMAT_VERSION,
  CURRENT_SHARED_DECK_SET_FORMAT_VERSION,
  SHARED_DECK_FORMAT,
  SHARED_DECK_SET_FORMAT,
  type SharedDeck,
  SharedDeckSchema,
  type SharedDeckSet,
  SharedDeckSetSchema,
} from "./schema";
import {
  type CardSizeViolation,
  validateSharedDeckCardSizes,
  validateSharedDeckSetCardSizes,
} from "./validate";

export type {
  SharedCard,
  SharedDeck,
  SharedDeckEntry,
  SharedDeckMeta,
  SharedDeckSet,
} from "./schema";
export { SHARED_DECK_FORMAT, SHARED_DECK_SET_FORMAT } from "./schema";
export type { CardSizeViolation } from "./validate";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type ImportError =
  | { kind: "JsonSyntaxError"; message: string }
  | { kind: "UnknownFormat"; expected: string; actual: unknown }
  | {
      kind: "IncompatibleVersion";
      expected: number;
      actual: unknown;
      direction: "newer" | "older-no-migration";
    }
  | { kind: "SchemaError"; issues: z.core.$ZodIssue[] }
  | { kind: "CardSizeError"; violations: readonly CardSizeViolation[] };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

type Header = { format: unknown; formatVersion: unknown };

function readHeader(parsed: unknown): Header {
  if (parsed === null || typeof parsed !== "object") {
    return { format: undefined, formatVersion: undefined };
  }
  const record = parsed as Record<string, unknown>;
  return { format: record.format, formatVersion: record.formatVersion };
}

type ParseSpec<T> = {
  expectedFormat: string;
  currentVersion: number;
  schema: { safeParse: (input: unknown) => z.ZodSafeParseResult<T> };
  migrate: (parsed: unknown, fromVersion: number) => unknown;
  validateSizes: (value: T) => CardSizeViolation[];
};

function runPipeline<T>(json: string, spec: ParseSpec<T>): Result<T, ImportError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return err({ kind: "JsonSyntaxError", message: e instanceof Error ? e.message : String(e) });
  }

  const header = readHeader(parsed);
  if (header.format !== spec.expectedFormat) {
    return err({ kind: "UnknownFormat", expected: spec.expectedFormat, actual: header.format });
  }

  const version = header.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return err({
      kind: "IncompatibleVersion",
      expected: spec.currentVersion,
      actual: version,
      direction: "older-no-migration",
    });
  }
  if (version > spec.currentVersion) {
    return err({
      kind: "IncompatibleVersion",
      expected: spec.currentVersion,
      actual: version,
      direction: "newer",
    });
  }

  let migrated: unknown = parsed;
  if (version < spec.currentVersion) {
    try {
      migrated = spec.migrate(parsed, version);
    } catch (e) {
      if (e instanceof NoMigrationError) {
        return err({
          kind: "IncompatibleVersion",
          expected: spec.currentVersion,
          actual: version,
          direction: "older-no-migration",
        });
      }
      throw e;
    }
  }

  const zodResult = spec.schema.safeParse(migrated);
  if (!zodResult.success) {
    return err({ kind: "SchemaError", issues: zodResult.error.issues });
  }

  const violations = spec.validateSizes(zodResult.data);
  if (violations.length > 0) {
    return err({ kind: "CardSizeError", violations });
  }

  return ok(zodResult.data);
}

export function parseSharedDeck(json: string): Result<SharedDeck, ImportError> {
  return runPipeline(json, {
    expectedFormat: SHARED_DECK_FORMAT,
    currentVersion: CURRENT_SHARED_DECK_FORMAT_VERSION,
    schema: SharedDeckSchema,
    migrate: migrateSharedDeck,
    validateSizes: validateSharedDeckCardSizes,
  });
}

export function parseSharedDeckSet(json: string): Result<SharedDeckSet, ImportError> {
  return runPipeline(json, {
    expectedFormat: SHARED_DECK_SET_FORMAT,
    currentVersion: CURRENT_SHARED_DECK_SET_FORMAT_VERSION,
    schema: SharedDeckSetSchema,
    migrate: migrateSharedDeckSet,
    validateSizes: validateSharedDeckSetCardSizes,
  });
}

export function stringifySharedDeck(deck: SharedDeck): string {
  return JSON.stringify(deck);
}

export function stringifySharedDeckSet(set: SharedDeckSet): string {
  return JSON.stringify(set);
}
