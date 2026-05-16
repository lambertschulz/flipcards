import { type ReviewLogRow, db } from "@/db/database";
import type { Rating } from "@/domain/sm2";

export type ReviewLogEntry = ReviewLogRow;

export type NewReviewLogEntry = {
  cardId: string;
  timestamp: number;
  rating: Rating;
  intervalAfter: number;
  easeAfter: number;
};

function newId(): string {
  return crypto.randomUUID();
}

export async function appendReview(entry: NewReviewLogEntry): Promise<ReviewLogEntry> {
  const row: ReviewLogRow = { id: newId(), ...entry };
  await db.reviews.add(row);
  return row;
}

export async function listReviewsForCard(cardId: string): Promise<ReviewLogEntry[]> {
  const rows = await db.reviews.where("cardId").equals(cardId).sortBy("timestamp");
  return rows;
}

export async function countReviewsSince(timestamp: number): Promise<number> {
  return db.reviews.where("timestamp").aboveOrEqual(timestamp).count();
}
