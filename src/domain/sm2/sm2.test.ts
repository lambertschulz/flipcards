import { INITIAL_REVIEW_STATE, type ReviewState, isDue, scheduleNext } from "@/domain/sm2";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshState(): ReviewState {
  return { ...INITIAL_REVIEW_STATE };
}

function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}

describe("scheduleNext (SM-2)", () => {
  const NOW = Date.parse("2026-05-17T10:00:00Z");

  it("starts new cards with a sensible default ease and 0 repetitions", () => {
    expect(INITIAL_REVIEW_STATE.repetitions).toBe(0);
    expect(INITIAL_REVIEW_STATE.intervalDays).toBe(0);
    expect(INITIAL_REVIEW_STATE.easeFactor).toBeGreaterThanOrEqual(2.4);
    expect(INITIAL_REVIEW_STATE.easeFactor).toBeLessThanOrEqual(2.6);
  });

  describe("Again-Reset", () => {
    it("resets repetitions to 0 and schedules for tomorrow", () => {
      const prior: ReviewState = {
        repetitions: 4,
        easeFactor: 2.8,
        intervalDays: 30,
        nextDue: NOW,
      };
      const next = scheduleNext(prior, "again", NOW);
      expect(next.repetitions).toBe(0);
      expect(next.intervalDays).toBe(1);
      expect(daysBetween(NOW, next.nextDue)).toBe(1);
    });

    it("decreases the ease factor but never below the 1.3 floor", () => {
      const prior: ReviewState = {
        repetitions: 0,
        easeFactor: 1.3,
        intervalDays: 0,
        nextDue: NOW,
      };
      const next = scheduleNext(prior, "again", NOW);
      expect(next.easeFactor).toBeCloseTo(1.3, 5);
    });
  });

  describe("Good-Multiplikation", () => {
    it("uses the standard SM-2 progression for the first three Goods (0 → 1 → 6 → prev*EF)", () => {
      let state = freshState();
      state = scheduleNext(state, "good", NOW);
      expect(state.repetitions).toBe(1);
      expect(state.intervalDays).toBe(1);

      const later = state.nextDue;
      state = scheduleNext(state, "good", later);
      expect(state.repetitions).toBe(2);
      expect(state.intervalDays).toBe(6);

      const later2 = state.nextDue;
      const easeAt2 = state.easeFactor;
      state = scheduleNext(state, "good", later2);
      expect(state.repetitions).toBe(3);
      expect(state.intervalDays).toBe(Math.round(6 * easeAt2));
    });

    it("leaves the ease factor essentially unchanged on Good", () => {
      const prior = freshState();
      const next = scheduleNext(prior, "good", NOW);
      expect(next.easeFactor).toBeCloseTo(prior.easeFactor, 5);
    });
  });

  describe("Easy-Bonus", () => {
    it("raises the ease factor relative to Good", () => {
      const easy = scheduleNext(freshState(), "easy", NOW);
      const good = scheduleNext(freshState(), "good", NOW);
      expect(easy.easeFactor).toBeGreaterThan(good.easeFactor);
    });

    it("schedules further out than Good for the same prior state", () => {
      const prior: ReviewState = {
        repetitions: 3,
        easeFactor: 2.5,
        intervalDays: 10,
        nextDue: NOW,
      };
      const easy = scheduleNext(prior, "easy", NOW);
      const good = scheduleNext(prior, "good", NOW);
      expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    });
  });

  describe("Hard-Reduktion", () => {
    it("lowers the ease factor relative to Good", () => {
      const hard = scheduleNext(freshState(), "hard", NOW);
      const good = scheduleNext(freshState(), "good", NOW);
      expect(hard.easeFactor).toBeLessThan(good.easeFactor);
    });

    it("does NOT reset repetitions — the user still answered correctly", () => {
      const prior: ReviewState = {
        repetitions: 5,
        easeFactor: 2.5,
        intervalDays: 30,
        nextDue: NOW,
      };
      const next = scheduleNext(prior, "hard", NOW);
      expect(next.repetitions).toBe(6);
    });

    it("schedules a shorter follow-up than Good for the same prior state", () => {
      const prior: ReviewState = {
        repetitions: 3,
        easeFactor: 2.5,
        intervalDays: 10,
        nextDue: NOW,
      };
      const hard = scheduleNext(prior, "hard", NOW);
      const good = scheduleNext(prior, "good", NOW);
      expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    });
  });

  it("computes nextDue as now + intervalDays (days, not hours)", () => {
    const prior: ReviewState = {
      repetitions: 3,
      easeFactor: 2.5,
      intervalDays: 10,
      nextDue: NOW,
    };
    const next = scheduleNext(prior, "good", NOW);
    expect(daysBetween(NOW, next.nextDue)).toBe(next.intervalDays);
  });
});

describe("isDue", () => {
  const NOW = Date.parse("2026-05-17T10:00:00Z");

  it("treats fresh cards (nextDue=0) as due", () => {
    expect(isDue(INITIAL_REVIEW_STATE, NOW)).toBe(true);
  });

  it("is true when nextDue is in the past or now", () => {
    expect(isDue({ ...INITIAL_REVIEW_STATE, nextDue: NOW - 1 }, NOW)).toBe(true);
    expect(isDue({ ...INITIAL_REVIEW_STATE, nextDue: NOW }, NOW)).toBe(true);
  });

  it("is false when nextDue is in the future", () => {
    expect(isDue({ ...INITIAL_REVIEW_STATE, nextDue: NOW + 1000 }, NOW)).toBe(false);
  });
});
