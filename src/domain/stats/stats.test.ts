import {
  type ReviewLogRow,
  type ReviewStateRow,
  addDays,
  computeStreak,
  countReviewsSince,
  dayKey,
  dueForecast,
  filterByRange,
  rangeStart,
  ratingDistribution,
  reviewsPerDay,
  startOfLocalDay,
} from "@/domain/stats";
import { describe, expect, it } from "vitest";

/**
 * All tests anchor on a fixed local-noon timestamp so the fixtures are stable
 * regardless of the host TZ they run in. We construct timestamps via the
 * `Date` ctor in local time, then convert to ms — same convention the
 * production code uses.
 */
const NOON = new Date(2026, 4, 15, 12, 0, 0, 0).getTime(); // 2026-05-15 12:00 local
const DAY = 24 * 60 * 60 * 1000;

function rev(
  daysAgo: number,
  rating: ReviewLogRow["rating"] = "good",
  cardId = "c1",
): ReviewLogRow {
  return {
    cardId,
    rating,
    // Anchor reviews at local noon on the target day so they're well inside
    // the day's bucket regardless of how the boundary is computed.
    timestamp: addDays(NOON, -daysAgo) + 12 * 60 * 60 * 1000,
  };
}

describe("dayKey", () => {
  it("formats a local-day key as YYYY-MM-DD", () => {
    expect(dayKey(NOON)).toBe("2026-05-15");
  });
});

describe("startOfLocalDay", () => {
  it("snaps to local midnight of the same day", () => {
    const t = new Date(2026, 4, 15, 23, 30, 0, 0).getTime();
    const midnight = new Date(2026, 4, 15, 0, 0, 0, 0).getTime();
    expect(startOfLocalDay(t)).toBe(midnight);
  });
});

describe("rangeStart", () => {
  it("today → start of today", () => {
    expect(rangeStart("today", NOON)).toBe(startOfLocalDay(NOON));
  });
  it("week → start of day 6 days ago (inclusive 7-day window)", () => {
    expect(rangeStart("week", NOON)).toBe(addDays(NOON, -6));
  });
  it("month → start of day 29 days ago", () => {
    expect(rangeStart("month", NOON)).toBe(addDays(NOON, -29));
  });
  it("all → 0", () => {
    expect(rangeStart("all", NOON)).toBe(0);
  });
});

describe("filterByRange", () => {
  const reviews: ReviewLogRow[] = [
    rev(0), // today
    rev(3), // 3 days ago
    rev(10), // 10 days ago
    rev(40), // 40 days ago
  ];

  it("today drops reviews older than today's midnight", () => {
    expect(filterByRange(reviews, "today", NOON).map((r) => r.timestamp)).toEqual([
      reviews[0].timestamp,
    ]);
  });

  it("week keeps reviews within the rolling 7-day window", () => {
    const result = filterByRange(reviews, "week", NOON).map((r) => r.timestamp);
    expect(result).toEqual([reviews[0].timestamp, reviews[1].timestamp]);
  });

  it("month keeps reviews within the rolling 30-day window", () => {
    const result = filterByRange(reviews, "month", NOON).map((r) => r.timestamp);
    expect(result).toEqual([reviews[0].timestamp, reviews[1].timestamp, reviews[2].timestamp]);
  });

  it("all keeps everything", () => {
    expect(filterByRange(reviews, "all", NOON).length).toBe(4);
  });
});

describe("reviewsPerDay", () => {
  it("emits exactly `days` buckets, including zero-count days", () => {
    const result = reviewsPerDay([rev(0), rev(2), rev(2)], NOON, 5);
    expect(result.map((d) => d.count)).toEqual([0, 0, 2, 0, 1]);
    expect(result[result.length - 1].day).toBe(dayKey(NOON));
  });

  it("ignores reviews older than the window", () => {
    const result = reviewsPerDay([rev(0), rev(99)], NOON, 7);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(1);
  });

  it("handles an empty log", () => {
    const result = reviewsPerDay([], NOON, 3);
    expect(result.map((d) => d.count)).toEqual([0, 0, 0]);
  });
});

describe("computeStreak", () => {
  it("returns zero for an empty log", () => {
    expect(computeStreak([], NOON)).toEqual({ current: 0, record: 0 });
  });

  it("counts consecutive days ending today", () => {
    const reviews = [rev(0), rev(1), rev(2), rev(3)];
    expect(computeStreak(reviews, NOON)).toEqual({ current: 4, record: 4 });
  });

  it("anchors current streak on yesterday if today has no review yet", () => {
    const reviews = [rev(1), rev(2), rev(3)];
    expect(computeStreak(reviews, NOON)).toEqual({ current: 3, record: 3 });
  });

  it("breaks current streak when both today and yesterday are empty", () => {
    const reviews = [rev(2), rev(3), rev(4)];
    const r = computeStreak(reviews, NOON);
    expect(r.current).toBe(0);
    expect(r.record).toBe(3);
  });

  it("record is the longest run anywhere in the log", () => {
    // Run A: 5 days ending 10 days ago (10..6 inclusive).
    // Run B: 2 days ending today.
    const reviews = [rev(0), rev(1), rev(6), rev(7), rev(8), rev(9), rev(10)];
    expect(computeStreak(reviews, NOON)).toEqual({ current: 2, record: 5 });
  });

  it("multiple reviews on the same day collapse to one day", () => {
    const reviews = [rev(0), rev(0), rev(0), rev(1)];
    expect(computeStreak(reviews, NOON)).toEqual({ current: 2, record: 2 });
  });
});

describe("ratingDistribution", () => {
  it("counts each rating, defaults to zero", () => {
    const reviews: ReviewLogRow[] = [
      rev(0, "again"),
      rev(0, "good"),
      rev(0, "good"),
      rev(0, "easy"),
    ];
    expect(ratingDistribution(reviews)).toEqual({ again: 1, hard: 0, good: 2, easy: 1 });
  });

  it("empty log → all zero", () => {
    expect(ratingDistribution([])).toEqual({ again: 0, hard: 0, good: 0, easy: 0 });
  });
});

describe("dueForecast", () => {
  it("buckets cards by next-due day, folding overdue into today", () => {
    const states: ReviewStateRow[] = [
      { cardId: "a", nextDue: NOON - DAY * 3 }, // overdue → today
      { cardId: "b", nextDue: NOON }, // today
      { cardId: "c", nextDue: NOON + DAY * 1 + 1000 }, // tomorrow
      { cardId: "d", nextDue: NOON + DAY * 1 + 60_000 }, // tomorrow
      { cardId: "e", nextDue: NOON + DAY * 5 }, // outside 3-day window
    ];
    const r = dueForecast(states, NOON, 3);
    expect(r.map((d) => d.count)).toEqual([2, 2, 0]);
  });

  it("emits exactly `days` buckets", () => {
    const r = dueForecast([], NOON, 7);
    expect(r).toHaveLength(7);
    expect(r.every((d) => d.count === 0)).toBe(true);
  });

  it("buckets are dated in chronological order starting today", () => {
    const r = dueForecast([], NOON, 3);
    expect(r[0].day).toBe(dayKey(NOON));
    expect(r[1].day).toBe(dayKey(addDays(NOON, 1)));
    expect(r[2].day).toBe(dayKey(addDays(NOON, 2)));
  });
});

describe("countReviewsSince", () => {
  it("counts reviews with timestamp ≥ from", () => {
    const reviews = [rev(0), rev(1), rev(3)];
    const sinceYesterday = addDays(NOON, -1);
    // rev(0) (today) and rev(1) (yesterday at noon) are ≥ yesterday midnight.
    expect(countReviewsSince(reviews, sinceYesterday)).toBe(2);
  });
});
