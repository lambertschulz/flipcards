import { type DeckSetRow, db } from "@/db/database";
import type { Deck } from "@/domain/deck";
import {
  type DeckSet,
  type DeckSetPatch,
  addDeckToSet,
  createDeckSet,
  removeDeckFromSet,
  updateDeckSet,
} from "@/domain/deck-set";

function toRow(set: DeckSet): DeckSetRow {
  const row: DeckSetRow = { id: set.id, name: set.name };
  if (set.description !== undefined) row.description = set.description;
  return row;
}

function fromRow(row: DeckSetRow): DeckSet {
  const set: DeckSet = { id: row.id, name: row.name };
  if (row.description !== undefined) set.description = row.description;
  return set;
}

function newId(): string {
  return crypto.randomUUID();
}

export type NewDeckSetInput = {
  name: string;
  description?: string;
};

export async function createDeckSetInDb(input: NewDeckSetInput): Promise<DeckSet> {
  const set = createDeckSet({ id: newId(), ...input });
  await db.deckSets.add(toRow(set));
  return set;
}

export async function updateDeckSetInDb(setId: string, patch: DeckSetPatch): Promise<DeckSet> {
  const row = await db.deckSets.get(setId);
  if (!row) throw new Error(`Deck-Set not found: ${setId}`);
  const next = updateDeckSet(fromRow(row), patch);
  await db.deckSets.put(toRow(next));
  return next;
}

export async function getDeckSet(setId: string): Promise<DeckSet | undefined> {
  const row = await db.deckSets.get(setId);
  return row ? fromRow(row) : undefined;
}

export async function listDeckSets(): Promise<DeckSet[]> {
  const rows = await db.deckSets.orderBy("name").toArray();
  return rows.map(fromRow);
}

/**
 * Add a Deck to a Deck-Set. Wraps the pure `addDeckToSet` and persists the
 * resulting Deck row. Idempotent if the deck already belongs to that set; if
 * it belongs to another set, this *moves* it (ADR-0003 — every deck in ≤ 1
 * set).
 */
export async function addDeckToSetInDb(deckId: string, deckSetId: string): Promise<void> {
  const deckRow = await db.decks.get(deckId);
  if (!deckRow) throw new Error(`Deck not found: ${deckId}`);
  const setRow = await db.deckSets.get(deckSetId);
  if (!setRow) throw new Error(`Deck-Set not found: ${deckSetId}`);
  const deck: Deck = fromDeckRow(deckRow);
  const next = addDeckToSet(deck, deckSetId);
  await db.decks.put({ ...deckRow, deckSetId: next.deckSetId });
}

/**
 * Remove a Deck from its Deck-Set. The deck becomes lose (ADR-0003). Empty
 * Deck-Sets are *not* auto-removed (ADR-0014).
 */
export async function removeDeckFromSetInDb(deckId: string): Promise<void> {
  const deckRow = await db.decks.get(deckId);
  if (!deckRow) throw new Error(`Deck not found: ${deckId}`);
  const deck = fromDeckRow(deckRow);
  const next = removeDeckFromSet(deck);
  await db.decks.put({ ...deckRow, deckSetId: next.deckSetId });
}

/**
 * List decks currently in a given Deck-Set.
 */
export async function listDecksInSet(setId: string): Promise<Deck[]> {
  const rows = await db.decks.where("deckSetId").equals(setId).toArray();
  return rows.map(fromDeckRow).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List "lose" decks — those not assigned to any Deck-Set. Dexie's index
 * cannot match `undefined` directly, so we filter via a JS predicate after
 * pulling the table.
 */
export async function listLoseDecks(): Promise<Deck[]> {
  const rows = await db.decks.toArray();
  return rows
    .filter((row) => row.deckSetId === undefined)
    .map(fromDeckRow)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// We replicate the small `fromRow` shape used by `db/decks.ts` here rather
// than re-exporting it, to keep the row→domain boundary local to each
// repository module. The shape is small and stable; duplicating two lines
// avoids reaching into a sibling file's internals.
function fromDeckRow(row: import("@/db/database").DeckRow): Deck {
  const deck: Deck = { id: row.id, name: row.name };
  if (row.description !== undefined) deck.description = row.description;
  if (row.deckSetId !== undefined) deck.deckSetId = row.deckSetId;
  return deck;
}
