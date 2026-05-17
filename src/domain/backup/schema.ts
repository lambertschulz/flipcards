// Zod schemas for the Backup JSON format (ADR-0016 axis #4).
//
// A Backup is the complete local snapshot — all Decks, Deck-Sets, Cards, and
// Review-States — and is **distinct** from a Shared Deck. CONTEXT.md spells
// that distinction out; we double down on it by versioning the Backup format
// on its own `formatVersion` axis, independent from the Shared-Deck counter.
// That way an additive change to one (e.g. a new Settings block in Backup)
// doesn't fake-bump the other.
//
// The Zod schemas here are the source of truth — the TS types are inferred.
// Hand-written types alongside would drift; we infer instead.

import { z } from "zod";

import { SharedCardSchema } from "@/domain/shared-deck/schema";

export const CURRENT_BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = "flipcards.backup";

const ID_REGEX = /^[A-Za-z0-9_-]{8,}$/;
const MAX_NAME_LENGTH = 200;

const idSchema = z.string().regex(ID_REGEX, "id must match /^[A-Za-z0-9_-]{8,}$/");

const nameSchema = z.string().refine(
  (raw) => {
    const trimmed = raw.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;
  },
  { message: `name must be 1..${MAX_NAME_LENGTH} characters after trim` },
);

// A backed-up Deck carries the same shape as the in-memory Deck plus its
// optional Deck-Set membership. We reuse `SharedCardSchema` for the Card body
// because the on-disk Card layout is identical across Shared-Deck and Backup
// (front/back/tags) — the only difference is that Backup also carries the
// owning `deckId`, which lives on the wrapper here.
const BackupDeckSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  deckSetId: idSchema.optional(),
  cards: z
    .array(SharedCardSchema)
    .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, {
      message: "card ids must be unique within a deck",
    }),
});

const BackupDeckSetSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
});

// Review-State row. Mirrors `ReviewStateRow` in the Dexie schema — but lives
// here as a Zod schema so on-disk Backup files are self-validating without
// needing the DB layer to round-trip them. `nextDue` is an epoch-ms number;
// `easeFactor` is a positive float (SM-2 default 2.5, floor 1.3 per ADR-0002).
const BackupReviewStateSchema = z.object({
  cardId: idSchema,
  repetitions: z.number().int().nonnegative(),
  easeFactor: z.number().positive(),
  intervalDays: z.number().nonnegative(),
  nextDue: z.number().int(),
});

export const BackupFileV1Schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(CURRENT_BACKUP_FORMAT_VERSION),
  exportedAt: z.string(),
  // App-SemVer at export time. Informational — drives no parse behaviour, but
  // useful for diagnostics ("this backup is from app 0.3.1") and for future
  // compat hints.
  appVersion: z.string(),
  decks: z
    .array(BackupDeckSchema)
    .refine((decks) => new Set(decks.map((d) => d.id)).size === decks.length, {
      message: "deck ids must be unique",
    }),
  deckSets: z
    .array(BackupDeckSetSchema)
    .refine((sets) => new Set(sets.map((s) => s.id)).size === sets.length, {
      message: "deckSet ids must be unique",
    }),
  reviewStates: z
    .array(BackupReviewStateSchema)
    .refine((states) => new Set(states.map((s) => s.cardId)).size === states.length, {
      message: "reviewState cardIds must be unique",
    }),
});

export type BackupDeck = z.infer<typeof BackupDeckSchema>;
export type BackupDeckSet = z.infer<typeof BackupDeckSetSchema>;
export type BackupReviewState = z.infer<typeof BackupReviewStateSchema>;
export type BackupFileV1 = z.infer<typeof BackupFileV1Schema>;
