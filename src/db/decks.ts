import { type DeckRow, db } from "@/db/database";
import { type Deck, type DeckPatch, createDeck, updateDeck } from "@/domain/deck";

function toRow(deck: Deck): DeckRow {
  const row: DeckRow = { id: deck.id, name: deck.name };
  if (deck.description !== undefined) row.description = deck.description;
  if (deck.deckSetId !== undefined) row.deckSetId = deck.deckSetId;
  // Preserve ADR-0010 Curated-Deck provenance across rename / metadata
  // edits so a future "Update verfügbar" UX still recognises the deck.
  if (deck.curatedSourceId !== undefined) row.curatedSourceId = deck.curatedSourceId;
  if (deck.contentVersion !== undefined) row.contentVersion = deck.contentVersion;
  return row;
}

function fromRow(row: DeckRow): Deck {
  const deck: Deck = { id: row.id, name: row.name };
  if (row.description !== undefined) deck.description = row.description;
  if (row.deckSetId !== undefined) deck.deckSetId = row.deckSetId;
  if (row.curatedSourceId !== undefined) deck.curatedSourceId = row.curatedSourceId;
  if (row.contentVersion !== undefined) deck.contentVersion = row.contentVersion;
  return deck;
}

function newId(): string {
  return crypto.randomUUID();
}

export type NewDeckInput = {
  name: string;
  description?: string;
  deckSetId?: string | null;
};

export async function createDeckInDb(input: NewDeckInput): Promise<Deck> {
  const deck = createDeck({ id: newId(), ...input });
  await db.decks.add(toRow(deck));
  return deck;
}

export async function updateDeckInDb(deckId: string, patch: DeckPatch): Promise<Deck> {
  const row = await db.decks.get(deckId);
  if (!row) throw new Error(`Deck not found: ${deckId}`);
  const next = updateDeck(fromRow(row), patch);
  await db.decks.put(toRow(next));
  return next;
}

export async function moveDeckToSetInDb(deckId: string, deckSetId: string | null): Promise<void> {
  const row = await db.decks.get(deckId);
  if (!row) throw new Error(`Deck not found: ${deckId}`);
  const next: DeckRow = { ...row, deckSetId: deckSetId ?? undefined };
  await db.decks.put(next);
}

export async function getDeck(deckId: string): Promise<Deck | undefined> {
  const row = await db.decks.get(deckId);
  return row ? fromRow(row) : undefined;
}

export async function listDecks(): Promise<Deck[]> {
  const rows = await db.decks.orderBy("name").toArray();
  return rows.map(fromRow);
}
