import { type CardRow, db } from "@/db/database";
import { type Card, type CardPatch, createCard, updateCard, validateCardSize } from "@/domain/card";

function toRow(card: Card): CardRow {
  return {
    id: card.id,
    deckId: card.deckId,
    front: card.front,
    back: card.back,
    tags: [...card.tags],
  };
}

function fromRow(row: CardRow): Card {
  return {
    id: row.id,
    deckId: row.deckId,
    front: row.front,
    back: row.back,
    tags: [...(row.tags ?? [])],
  };
}

function newId(): string {
  return crypto.randomUUID();
}

export type NewCardInput = {
  deckId: string;
  front: string;
  back: string;
  tags?: string[];
};

export async function createCardInDb(input: NewCardInput): Promise<Card> {
  const card = createCard({ id: newId(), ...input });
  validateCardSize(card);
  await db.cards.add(toRow(card));
  return card;
}

export async function updateCardInDb(cardId: string, patch: CardPatch): Promise<Card> {
  const row = await db.cards.get(cardId);
  if (!row) throw new Error(`Card not found: ${cardId}`);
  const next = updateCard(fromRow(row), patch);
  validateCardSize(next);
  await db.cards.put(toRow(next));
  return next;
}

export async function getCard(cardId: string): Promise<Card | undefined> {
  const row = await db.cards.get(cardId);
  return row ? fromRow(row) : undefined;
}

export async function listCardsInDeck(deckId: string): Promise<Card[]> {
  const rows = await db.cards.where("deckId").equals(deckId).toArray();
  return rows.map(fromRow);
}

export async function listAllCards(): Promise<Card[]> {
  const rows = await db.cards.toArray();
  return rows.map(fromRow);
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.cards.delete(cardId);
}
