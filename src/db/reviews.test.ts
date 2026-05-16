import "fake-indexeddb/auto";
import { db } from "@/db/database";
import { appendReview, countReviewsSince, listReviewsForCard } from "@/db/reviews";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("review log repository", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.reviews.clear();
  });

  it("appends a review entry and assigns it an id", async () => {
    const entry = await appendReview({
      cardId: "card-1",
      timestamp: 1000,
      rating: "good",
      intervalAfter: 6,
      easeAfter: 2.5,
    });
    expect(entry.id).toMatch(/.+/);
    expect(entry.cardId).toBe("card-1");
  });

  it("lists reviews for a single card in timestamp order", async () => {
    await appendReview({
      cardId: "card-1",
      timestamp: 3000,
      rating: "good",
      intervalAfter: 6,
      easeAfter: 2.5,
    });
    await appendReview({
      cardId: "card-1",
      timestamp: 1000,
      rating: "again",
      intervalAfter: 1,
      easeAfter: 2.3,
    });
    await appendReview({
      cardId: "card-2",
      timestamp: 2000,
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });
    const card1Reviews = await listReviewsForCard("card-1");
    expect(card1Reviews.map((r) => r.timestamp)).toEqual([1000, 3000]);
  });

  it("counts reviews since a given timestamp (used for 'Heute gelernt' per ADR-0012)", async () => {
    await appendReview({
      cardId: "c1",
      timestamp: 1000,
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });
    await appendReview({
      cardId: "c2",
      timestamp: 5000,
      rating: "again",
      intervalAfter: 1,
      easeAfter: 2.3,
    });
    expect(await countReviewsSince(3000)).toBe(1);
    expect(await countReviewsSince(0)).toBe(2);
  });
});
