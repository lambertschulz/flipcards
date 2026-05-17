// Zod schemas for the Shared-Deck and Shared-Deck-Set JSON formats.
// Source of truth — the TS types in ADR-0018 describe *what*, these schemas
// are *how*. Hand-written types alongside would drift; we infer instead.

import { z } from "zod";

export const CURRENT_SHARED_DECK_FORMAT_VERSION = 1;
export const CURRENT_SHARED_DECK_SET_FORMAT_VERSION = 1;

export const SHARED_DECK_FORMAT = "flipcards.shared-deck";
export const SHARED_DECK_SET_FORMAT = "flipcards.shared-deck-set";

const ID_REGEX = /^[A-Za-z0-9_-]{8,}$/;
const MAX_NAME_LENGTH = 200;
const MAX_TAG_LENGTH = 64;

const idSchema = z.string().regex(ID_REGEX, "id must match /^[A-Za-z0-9_-]{8,}$/");

// 1..200 chars after trim. We don't normalize — the raw value round-trips.
const nameSchema = z.string().refine(
  (raw) => {
    const trimmed = raw.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;
  },
  { message: `name must be 1..${MAX_NAME_LENGTH} characters after trim` },
);

const tagSchema = z
  .string()
  .min(1, "tag must not be empty")
  .max(MAX_TAG_LENGTH, `tag must not exceed ${MAX_TAG_LENGTH} characters`)
  .refine((t) => t === t.trim(), {
    message: "tag must not have leading or trailing whitespace",
  });

const tagsSchema = z
  .array(tagSchema)
  .refine((tags) => new Set(tags).size === tags.length, { message: "tags must be deduplicated" });

export const SharedCardSchema = z.object({
  id: idSchema,
  front: z.string(),
  back: z.string(),
  tags: tagsSchema,
});

const SharedDeckMetaSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
  curatedSourceId: z.string().optional(),
  contentVersion: z.number().int().nonnegative().optional(),
});

const cardsArraySchema = z
  .array(SharedCardSchema)
  .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, {
    message: "card ids must be unique within a deck",
  });

export const SharedDeckSchema = z.object({
  format: z.literal(SHARED_DECK_FORMAT),
  formatVersion: z.literal(CURRENT_SHARED_DECK_FORMAT_VERSION),
  exportedAt: z.string(),
  deck: SharedDeckMetaSchema,
  cards: cardsArraySchema,
});

const SharedDeckSetMetaSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().optional(),
});

const SharedDeckEntrySchema = SharedDeckMetaSchema.extend({
  cards: cardsArraySchema,
});

export const SharedDeckSetSchema = z
  .object({
    format: z.literal(SHARED_DECK_SET_FORMAT),
    formatVersion: z.literal(CURRENT_SHARED_DECK_SET_FORMAT_VERSION),
    exportedAt: z.string(),
    deckSet: SharedDeckSetMetaSchema,
    decks: z.array(SharedDeckEntrySchema),
  })
  // Deck ids ARE structurally unique within a set — they're the primary key
  // of the Dexie `decks` table, and the importer's ID-match-merge logic
  // would otherwise silently fold the second deck's cards into the first
  // (losing the second deck's name + description metadata). Enforce at the
  // schema boundary.
  //
  // Card ids, on the other hand, are NOT required to be unique across
  // decks within a SharedDeckSet per ADR-0018 — cross-deck duplicates are
  // explicitly allowed at the file level. The importer handles in-file
  // collisions by keeping the first occurrence and surfacing the count in
  // the apply summary (see apply.ts).
  .refine((set) => new Set(set.decks.map((d) => d.id)).size === set.decks.length, {
    message: "deck ids must be unique within the deck-set",
  });

export type SharedCard = z.infer<typeof SharedCardSchema>;
export type SharedDeckMeta = z.infer<typeof SharedDeckMetaSchema>;
export type SharedDeck = z.infer<typeof SharedDeckSchema>;
export type SharedDeckEntry = z.infer<typeof SharedDeckEntrySchema>;
export type SharedDeckSet = z.infer<typeof SharedDeckSetSchema>;
