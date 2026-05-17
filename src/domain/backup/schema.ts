// Zod schemas for the Backup JSON format (ADR-0016 axis #4).
//
// A Backup is the complete local snapshot — all Decks, Deck-Sets, Cards,
// Review-States, plus the per-rating review log (ADR-0012). It is **distinct**
// from a Shared Deck (CONTEXT.md): a Shared Deck is one deck, no review data,
// for sharing; a Backup is everything, private to the local user. The two
// formats version on their own `formatVersion` axes — additive changes to one
// don't fake-bump the other.
//
// The Zod schemas here are the source of truth — the TS types are inferred.
// We reuse `SharedCardSchema` for the per-card body because the on-disk Card
// payload (front/back/tags) is byte-identical across the two formats; only
// the wrapper differs (a Backup-deck carries `deckSetId`, a Shared-Deck
// doesn't).

import { z } from "zod";

import { SharedCardSchema } from "@/domain/shared-deck/schema";

export const CURRENT_BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = "flipcards.backup";

const ID_REGEX = /^[A-Za-z0-9_-]{8,}$/;
const MAX_NAME_LENGTH = 200;

const idSchema = z.string().regex(ID_REGEX, "id must match /^[A-Za-z0-9_-]{8,}$/");

// 1..200 chars after trim. We don't normalize — the raw value round-trips so
// Export → Reset → Import reproduces the exact prior state (ticket AC).
const nameSchema = z.string().refine(
  (raw) => {
    const trimmed = raw.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;
  },
  { message: `name must be 1..${MAX_NAME_LENGTH} characters after trim` },
);

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
// going through the DB layer. `nextDue` is an epoch-ms number. `easeFactor`
// must be ≥ MIN_EASE_FACTOR (1.3) per ADR-0002; we enforce that floor here
// to keep the file honest even if a hand-edited file lowers it.
const BackupReviewStateSchema = z.object({
  cardId: idSchema,
  repetitions: z.number().int().nonnegative(),
  easeFactor: z.number().min(1.3, "easeFactor must be ≥ 1.3 (ADR-0002 floor)"),
  intervalDays: z.number().nonnegative(),
  nextDue: z.number().int(),
});

// Review-Log row. ADR-0012 pins the log as the source of truth for stats
// surfaces (heatmap, streak, per-card history); losing it on restore would
// silently wipe the user's learning history. Shape mirrors `ReviewLogRow`.
const BackupReviewLogSchema = z.object({
  id: idSchema,
  cardId: idSchema,
  timestamp: z.number().int(),
  rating: z.enum(["again", "hard", "good", "easy"]),
  intervalAfter: z.number().nonnegative(),
  easeAfter: z.number().min(1.3),
});

export const BackupFileV1Schema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.literal(CURRENT_BACKUP_FORMAT_VERSION),
    exportedAt: z.string(),
    // App-SemVer at export time. Informational — drives no parse behaviour,
    // but useful for diagnostics ("this backup is from app 0.3.1").
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
    reviews: z
      .array(BackupReviewLogSchema)
      .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
        message: "review log ids must be unique",
      }),
  })
  // Card ids are the primary key of the Dexie `cards` table; two decks
  // carrying the same card id would silently overwrite on restore and make
  // `reviewStates.cardId` ambiguous. The per-deck uniqueness check above
  // fires first for localised errors — this global check is the
  // load-bearing one for restore safety.
  .refine(
    (file) => {
      const allIds = file.decks.flatMap((deck) => deck.cards.map((card) => card.id));
      return new Set(allIds).size === allIds.length;
    },
    { message: "card ids must be globally unique across all decks" },
  )
  // Restore is clean-slate wipe-and-replace (ADR-0011). The parser is the
  // only gate between the file on disk and the live IndexedDB; dangling
  // references would survive as orphan rows after restore (review history
  // attributed to a card that no longer exists, decks pointing at a missing
  // set). We reject all three shapes here so a corrupt or hand-edited file
  // can never produce orphans.
  .refine(
    (file) => {
      const cardIds = new Set(file.decks.flatMap((deck) => deck.cards.map((card) => card.id)));
      return file.reviewStates.every((state) => cardIds.has(state.cardId));
    },
    { message: "reviewStates.cardId must reference a card present in decks[].cards[]" },
  )
  .refine(
    (file) => {
      const cardIds = new Set(file.decks.flatMap((deck) => deck.cards.map((card) => card.id)));
      return file.reviews.every((row) => cardIds.has(row.cardId));
    },
    { message: "reviews.cardId must reference a card present in decks[].cards[]" },
  )
  .refine(
    (file) => {
      const setIds = new Set(file.deckSets.map((set) => set.id));
      return file.decks.every((deck) => deck.deckSetId === undefined || setIds.has(deck.deckSetId));
    },
    { message: "decks.deckSetId must reference a deck-set present in deckSets[]" },
  );

export type BackupDeck = z.infer<typeof BackupDeckSchema>;
export type BackupDeckSet = z.infer<typeof BackupDeckSetSchema>;
export type BackupReviewState = z.infer<typeof BackupReviewStateSchema>;
export type BackupReviewLog = z.infer<typeof BackupReviewLogSchema>;
export type BackupFileV1 = z.infer<typeof BackupFileV1Schema>;
