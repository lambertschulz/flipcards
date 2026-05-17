// Zod schema for the Curated-Decks manifest (`public/curated/index.json`).
//
// ADR-0010 spells out the manifest as the discovery surface for the
// Curated-Deck library: a small JSON file listing each curated entry by
// title, description, language, card-count, `curatedSourceId`, `version`,
// plus a `slug` that points at the per-entry deck JSON in the same
// directory. The per-entry JSON itself is a regular `flipcards.shared-deck`
// or `flipcards.shared-deck-set` payload — same Zod schema, same import
// pipeline.
//
// The manifest deliberately does NOT carry the card payloads. They live in
// per-entry JSON files alongside it, fetched on demand when the user opens
// the detail view. That keeps the initial library-listing fetch tiny.

import { z } from "zod";

export const CURATED_MANIFEST_FILENAME = "curated/index.json";

// `slug` becomes the filename: `curated/<slug>.json`. Restrict to lowercase
// kebab-case / digits so the URL we build is safe without further encoding,
// and so two manifest authors can't accidentally produce different on-disk
// names that point at the same logical entry.
const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase kebab-case (a-z0-9 and -)")
  .max(80, "slug must not exceed 80 characters");

// `kind` discriminates between a per-entry payload that's a single
// `SharedDeck` and one that's a `SharedDeckSet`. The library UI uses it to
// decide which parse + apply pipeline to invoke.
const kindSchema = z.union([z.literal("deck"), z.literal("deck-set")]);

const baseEntry = z.object({
  slug: slugSchema,
  kind: kindSchema,
  title: z.string().min(1, "title must not be empty").max(200),
  // Optional human-readable description. The detail view shows it verbatim.
  description: z.string().optional(),
  // BCP-47 tag (or close enough — we don't validate, only display).
  language: z.string().optional(),
  // Card-count for the listing badge. The detail view re-derives it from the
  // fetched payload so a manifest-payload mismatch can't mislead the import.
  cardCount: z.number().int().nonnegative(),
  // ADR-0010 provenance fields. Surfaced in the manifest so we don't need to
  // download the payload just to display the version on the list.
  curatedSourceId: z.string().min(1, "curatedSourceId must not be empty"),
  version: z.number().int().nonnegative(),
  // Optional per-entry license note. ADR-0010 keeps a per-deck `license`
  // *schema* field out-of-scope, but the manifest is allowed to carry a
  // free-text note for display (e.g. "CC-BY-SA 4.0"). Falsy → "Repo-Lizenz".
  license: z.string().optional(),
});

export const CuratedManifestEntrySchema = baseEntry;

export const CuratedManifestSchema = z
  .object({
    entries: z.array(CuratedManifestEntrySchema),
  })
  // `curatedSourceId` is the stable cross-version identifier — duplicate
  // entries would let two manifest rows fight over the same persisted
  // provenance row on import. Catch at the schema boundary.
  .refine((m) => new Set(m.entries.map((e) => e.curatedSourceId)).size === m.entries.length, {
    message: "curatedSourceId must be unique across all entries",
  })
  // Two entries with the same slug would resolve to the same on-disk URL
  // and the second would silently shadow the first. Block at parse time.
  .refine((m) => new Set(m.entries.map((e) => e.slug)).size === m.entries.length, {
    message: "slug must be unique across all entries",
  });

export type CuratedManifestEntry = z.infer<typeof CuratedManifestEntrySchema>;
export type CuratedManifest = z.infer<typeof CuratedManifestSchema>;
