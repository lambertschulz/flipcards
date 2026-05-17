// Statistik-Aggregationen (ADR-0012). Pure — no React, Dexie, Jotai.
//
// All functions take in-memory snapshots of the `Review`-Log (and, for
// Forecast, the per-card `ReviewState` table) and return shape-stable read
// models. Time-bucket boundaries follow ADR-0012's "lokale Mitternacht im
// Geräte-Timezone" rule: callers pass a `now` epoch-ms (so tests stay
// deterministic) and we derive the calendar day in *local* time via
// `Date#getFullYear`/`getMonth`/`getDate` (those return the host TZ, which
// matches ADR-0012's chosen tag-boundary).
//
// Why not the UTC equivalents? See ADR-0012 → "Tages-Grenze nutzt lokale
// Mitternacht" — the user-facing "Heute"-Streak/-Heatmap should follow the
// device's wall clock, not UTC, so travel/DST behave like Anki.
//
// The fixture-data tests live next to this file and pin every aggregation
// against handcrafted Review-rows.

import type { Rating } from "@/domain/sm2";

/** One row of the `Review`-Log table (subset the stats domain consumes). */
export type ReviewLogRow = {
  cardId: string;
  timestamp: number;
  rating: Rating;
};

/** One row of the per-card `ReviewState` (subset Forecast consumes). */
export type ReviewStateRow = {
  cardId: string;
  nextDue: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// --- date helpers ----------------------------------------------------------

/**
 * Calendar-day key (`YYYY-MM-DD`) for an epoch-ms timestamp, in the local
 * timezone. The string form is human-readable and trivially sortable; using a
 * numeric epoch-of-midnight would also work but the string maps directly onto
 * the heatmap's x-axis labels.
 */
export function dayKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Epoch-ms of local midnight at the start of the given timestamp's day. */
export function startOfLocalDay(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Epoch-ms of local midnight `n` days after `timestampMs`'s day. */
export function addDays(timestampMs: number, n: number): number {
  const d = new Date(timestampMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

// --- time-bucket filtering -------------------------------------------------

export type RangePreset = "today" | "week" | "month" | "all";

/**
 * Inclusive lower bound (epoch-ms) for a range preset relative to `now`.
 * - `today`: start of today (local midnight)
 * - `week`: start of day 6 days before today (rolling 7-day window inclusive)
 * - `month`: start of day 29 days before today (rolling 30-day window)
 * - `all`: 0 (everything)
 */
export function rangeStart(preset: RangePreset, now: number): number {
  switch (preset) {
    case "today":
      return startOfLocalDay(now);
    case "week":
      return addDays(now, -6);
    case "month":
      return addDays(now, -29);
    case "all":
      return 0;
  }
}

export function filterByRange(
  reviews: readonly ReviewLogRow[],
  preset: RangePreset,
  now: number,
): ReviewLogRow[] {
  const lower = rangeStart(preset, now);
  return reviews.filter((r) => r.timestamp >= lower);
}

// --- reviews-per-day -------------------------------------------------------

export type DayCount = {
  /** `YYYY-MM-DD` day key (local TZ). */
  day: string;
  /** Reviews on that day. */
  count: number;
};

/**
 * Bucket reviews into local-day counts for the last `days` days, ending on
 * the day of `now` (inclusive). Always returns exactly `days` entries —
 * empty days carry `count: 0` so the chart shows the gap explicitly.
 */
export function reviewsPerDay(
  reviews: readonly ReviewLogRow[],
  now: number,
  days: number,
): DayCount[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const key = dayKey(r.timestamp);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: DayCount[] = [];
  // i=0 → oldest day in the window, i=days-1 → today.
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = addDays(now, -i);
    const key = dayKey(dayStart);
    out.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

// --- streak ----------------------------------------------------------------

export type Streak = {
  /** Consecutive days ending on today (or yesterday if today has none). */
  current: number;
  /** Longest run of consecutive days seen anywhere in the log. */
  record: number;
};

/**
 * Compute current and record streaks from the Review log.
 *
 * - **Current streak**: the run of consecutive days with ≥ 1 review that ends
 *   on today *or* yesterday. We tolerate "no review today yet" because
 *   otherwise the chip flickers off every morning before the user studies,
 *   which is more punishing than illuminating. The streak only breaks once a
 *   full day passes without a review.
 * - **Record streak**: the longest such run anywhere in the log.
 *
 * Empty log → `{ current: 0, record: 0 }`.
 */
export function computeStreak(reviews: readonly ReviewLogRow[], now: number): Streak {
  if (reviews.length === 0) return { current: 0, record: 0 };

  // Collect the set of local-day midnights that have at least one review.
  const dayStarts = new Set<number>();
  for (const r of reviews) {
    dayStarts.add(startOfLocalDay(r.timestamp));
  }
  const sortedDays = Array.from(dayStarts).sort((a, b) => a - b);

  // Record: walk sorted days, count consecutive-by-one-day runs.
  let record = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sortedDays) {
    if (prev !== null && day - prev === DAY_MS) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > record) record = run;
    prev = day;
  }

  // Current: walk back from today as long as each preceding day has a review.
  // Anchor = today if today has a review, else yesterday if yesterday has one.
  const today = startOfLocalDay(now);
  const yesterday = addDays(now, -1);
  let anchor: number;
  if (dayStarts.has(today)) {
    anchor = today;
  } else if (dayStarts.has(yesterday)) {
    anchor = yesterday;
  } else {
    return { current: 0, record };
  }

  let current = 0;
  let cursor = anchor;
  while (dayStarts.has(cursor)) {
    current += 1;
    cursor = cursor - DAY_MS;
  }

  return { current, record };
}

// --- answer distribution ---------------------------------------------------

export type RatingDistribution = Record<Rating, number>;

/** Count reviews per rating bucket. Missing ratings come back as 0. */
export function ratingDistribution(reviews: readonly ReviewLogRow[]): RatingDistribution {
  const out: RatingDistribution = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of reviews) {
    out[r.rating] += 1;
  }
  return out;
}

// --- due forecast ----------------------------------------------------------

export type ForecastDay = {
  /** `YYYY-MM-DD`. */
  day: string;
  /** Number of cards whose `nextDue` falls on that local day. */
  count: number;
};

/**
 * Forecast how many cards become due on each of the next `days` calendar
 * days starting today (inclusive). Drawn from per-card `ReviewState`
 * snapshots, *not* the Review-Log — the log is historical, the forecast is
 * derived from "when each card is next scheduled".
 *
 * **Bucketing rule**: a card `nextDue ≤ end-of-today` lands in today's
 * bucket (so already-overdue cards aren't lost off the left edge); after
 * that, days are exact `nextDue ∈ [day-start, next-day-start)`. Anything
 * past the last day in the window is excluded.
 *
 * Why include overdue in today? The forecast answers "how much work is
 * waiting for me on day X". Overdue cards are waiting *right now*, so
 * folding them into today is the read users intuit.
 */
export function dueForecast(
  states: readonly ReviewStateRow[],
  now: number,
  days: number,
): ForecastDay[] {
  // Pre-compute the day boundaries we care about.
  const dayStarts: number[] = [];
  for (let i = 0; i < days; i++) {
    dayStarts.push(addDays(now, i));
  }
  const windowEnd = addDays(now, days); // exclusive

  const counts = new Array<number>(days).fill(0);
  for (const s of states) {
    if (s.nextDue >= windowEnd) continue;
    if (s.nextDue < dayStarts[0]) {
      // Overdue (or due earlier today): fold into bucket 0.
      counts[0] += 1;
      continue;
    }
    // Find the bucket: largest index where dayStarts[i] ≤ s.nextDue.
    // Linear scan is fine — `days` is bounded by the UI (7 or 30).
    let idx = 0;
    for (let i = 0; i < days; i++) {
      if (dayStarts[i] <= s.nextDue) idx = i;
      else break;
    }
    counts[idx] += 1;
  }

  return dayStarts.map((start, i) => ({ day: dayKey(start), count: counts[i] }));
}

// --- total / today-learned -------------------------------------------------

/** Count reviews since `from` (inclusive). Used for "Heute gelernt". */
export function countReviewsSince(reviews: readonly ReviewLogRow[], from: number): number {
  let n = 0;
  for (const r of reviews) {
    if (r.timestamp >= from) n += 1;
  }
  return n;
}
