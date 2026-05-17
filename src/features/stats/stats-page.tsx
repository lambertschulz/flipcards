import { db } from "@/db/database";
import type { Rating } from "@/domain/sm2";
import {
  type DayCount,
  type ForecastDay,
  type RangePreset,
  type RatingDistribution,
  type ReviewLogRow,
  type ReviewStateRow,
  type Streak,
  computeStreak,
  countReviewsSince,
  dueForecast,
  filterByRange,
  rangeStart,
  ratingDistribution,
  reviewsPerDay,
  startOfLocalDay,
} from "@/domain/stats";
import { type Settings, readSettings } from "@/lib/settings/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

/**
 * Statistik-Screen (issue #26, ADR-0012). Surfaces all v1-eligible aggregations
 * over the `Review`-Log:
 *
 *   • Range-Toggle (Heute / Woche / Monat / All-Time) — scopes the headline
 *     count and the answer-distribution.
 *   • Reviews-per-Day-Chart (last 30 days, fixed window — independent of the
 *     range toggle, per the brief).
 *   • Streak (current + record) — hidden when `settings.showStreak` is off
 *     (ADR-0012 opt-out).
 *   • Due-Forecast (next 7 days). The brief lists 7 *or* 30 — we pick 7
 *     because it fits a single SVG row at mobile widths without scrolling;
 *     longer-term forecast is easy to add later if users ask.
 *   • Answer-Distribution (again / hard / good / easy) — scoped to the range.
 *
 * All charts are hand-rolled SVG (no chart library) to stay under the
 * #15-tracked bundle budget. The shapes are minimal — bars, no axes labels
 * beyond the bare minimum — and follow the project's flat-list aesthetic
 * (memory: `project_design_direction_sammelkarten` — only the Review-Card
 * gets card chrome; everywhere else flat).
 */

const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Heute",
  week: "Woche",
  month: "Monat",
  all: "All-Time",
};

const RATING_LABELS: Record<Rating, string> = {
  again: "Nochmal",
  hard: "Schwer",
  good: "Gut",
  easy: "Leicht",
};

/**
 * Track the persisted `Settings` blob with live updates. Pages that mount
 * after Settings have changed get the fresh value via `readSettings()`; we
 * also listen for the in-tab `flipcards:settings-changed` event so toggling
 * "Lernserie anzeigen" reflects immediately without a refresh.
 */
function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Settings>).detail;
      if (detail) setSettings(detail);
      else setSettings(readSettings());
    };
    window.addEventListener("flipcards:settings-changed", onChange);
    return () => window.removeEventListener("flipcards:settings-changed", onChange);
  }, []);
  return settings;
}

export function StatsPage() {
  const [range, setRange] = useState<RangePreset>("week");
  const settings = useSettings();

  // Pull rows raw from Dexie; the domain layer projects them into the chart
  // shapes. We deliberately keep `now` evaluated on mount (not via a per-tick
  // hook) because the stats page renders aggregations over historical data —
  // a wall-clock tick across midnight while the page is open is a corner
  // case and the user can re-open to refresh. Avoiding `useNow()` keeps the
  // page free of re-render churn while charts are visible.
  const reviewRows = useLiveQuery(() => db.reviews.toArray(), [], undefined);
  const reviewStateRows = useLiveQuery(() => db.reviewStates.toArray(), [], undefined);

  const now = useMemo(() => Date.now(), []);

  if (reviewRows === undefined || reviewStateRows === undefined) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Statistik</h2>
        <p className="text-sm text-slate-500">Lade Daten…</p>
      </section>
    );
  }

  const reviews: ReviewLogRow[] = reviewRows.map((r) => ({
    cardId: r.cardId,
    timestamp: r.timestamp,
    rating: r.rating,
  }));
  const reviewStates: ReviewStateRow[] = reviewStateRows.map((s) => ({
    cardId: s.cardId,
    nextDue: s.nextDue,
  }));

  const scoped = filterByRange(reviews, range, now);
  const today = startOfLocalDay(now);
  const todayCount = countReviewsSince(reviews, today);
  const perDay = reviewsPerDay(reviews, now, 30);
  const streak = computeStreak(reviews, now);
  const forecast = dueForecast(reviewStates, now, 7);
  const distribution = ratingDistribution(scoped);

  const hasAnyReviews = reviews.length > 0;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">Statistik</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="stats-today-line">
          Heute gelernt: <strong>{todayCount}</strong> {todayCount === 1 ? "Card" : "Cards"}.
        </p>
      </header>

      <RangeToggle value={range} onChange={setRange} />

      <ScopedSummary range={range} reviews={scoped} rangeStartMs={rangeStart(range, now)} />

      {!hasAnyReviews ? (
        <EmptyState />
      ) : (
        <>
          <ReviewsPerDayChart data={perDay} />
          {settings.showStreak ? <StreakSection streak={streak} /> : null}
          <ForecastSection forecast={forecast} />
          <DistributionSection distribution={distribution} range={range} />
        </>
      )}
    </section>
  );
}

// --- Range toggle ---------------------------------------------------------

function RangeToggle({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (v: RangePreset) => void;
}) {
  const order: RangePreset[] = ["today", "week", "month", "all"];
  return (
    <fieldset className="flex flex-wrap gap-2" data-testid="stats-range-toggle">
      <legend className="sr-only">Zeitraum auswählen</legend>
      {order.map((preset) => {
        const checked = value === preset;
        return (
          <label
            key={preset}
            className={
              checked
                ? "cursor-pointer rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900"
                : "cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
            }
          >
            <input
              type="radio"
              name="stats-range"
              value={preset}
              checked={checked}
              onChange={() => onChange(preset)}
              className="sr-only"
            />
            {RANGE_LABELS[preset]}
          </label>
        );
      })}
    </fieldset>
  );
}

function ScopedSummary({
  range,
  reviews,
  rangeStartMs,
}: {
  range: RangePreset;
  reviews: readonly ReviewLogRow[];
  rangeStartMs: number;
}) {
  const total = reviews.length;
  const label =
    range === "today"
      ? "heute"
      : range === "week"
        ? "in den letzten 7 Tagen"
        : range === "month"
          ? "in den letzten 30 Tagen"
          : reviews.length === 0
            ? "insgesamt"
            : `seit ${formatDate(earliestTimestamp(reviews, rangeStartMs))}`;
  return (
    <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="stats-scoped-summary">
      <strong>{total}</strong> {total === 1 ? "Antwort" : "Antworten"} {label}.
    </p>
  );
}

function earliestTimestamp(reviews: readonly ReviewLogRow[], fallback: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (const r of reviews) {
    if (r.timestamp < min) min = r.timestamp;
  }
  return min === Number.POSITIVE_INFINITY ? fallback : min;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// --- Reviews-per-day chart -------------------------------------------------

/**
 * Mobile-first horizontal stack of 30 daily bars. We render bars as
 * proportional-height SVG rects rather than an external chart library to
 * keep the bundle small (no Recharts/Visx dependency); the visual is
 * intentionally minimalist.
 *
 * Width is 100% of the parent and the SVG uses `viewBox` so it scales down
 * to a 320 px screen without truncation. Heights are scaled against the
 * single tallest bar in the window, so a day with 1 review still shows up
 * even when another day has 50.
 */
function ReviewsPerDayChart({ data }: { data: readonly DayCount[] }) {
  const max = data.reduce((m, d) => (d.count > m ? d.count : m), 0);
  const totalReviews = data.reduce((s, d) => s + d.count, 0);
  // Layout constants: chart canvas is 300×80 viewBox; bars take ⅔ of each
  // slot so there's visual gap between them.
  const WIDTH = 300;
  const HEIGHT = 80;
  const N = data.length;
  const slot = WIDTH / N;
  const barWidth = slot * 0.7;

  return (
    <section className="space-y-2" data-testid="stats-reviews-per-day">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Reviews pro Tag (letzte 30 Tage)
      </h3>
      {totalReviews === 0 ? (
        <p className="text-sm text-slate-500">Keine Reviews in den letzten 30 Tagen.</p>
      ) : (
        <svg
          role="img"
          aria-label={`Reviews pro Tag, letzte 30 Tage, insgesamt ${totalReviews}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-24 w-full text-slate-700 dark:text-slate-200"
          preserveAspectRatio="none"
        >
          <title>Reviews pro Tag der letzten 30 Tage</title>
          {data.map((d, i) => {
            const h = max === 0 ? 0 : (d.count / max) * (HEIGHT - 4);
            const x = i * slot + (slot - barWidth) / 2;
            const y = HEIGHT - h;
            return (
              <rect
                key={d.day}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                fill="currentColor"
                opacity={d.count === 0 ? 0.15 : 0.85}
              >
                <title>
                  {d.day}: {d.count} {d.count === 1 ? "Review" : "Reviews"}
                </title>
              </rect>
            );
          })}
        </svg>
      )}
      <p className="text-xs text-slate-500">
        Erster Tag: {data[0]?.day ?? "—"} · Letzter Tag: {data[data.length - 1]?.day ?? "—"}
      </p>
    </section>
  );
}

// --- Streak --------------------------------------------------------------

function StreakSection({ streak }: { streak: Streak }) {
  return (
    <section className="space-y-2" data-testid="stats-streak">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">Lernserie</h3>
      <dl className="flex gap-6 text-sm">
        <div>
          <dt className="text-slate-500">Aktuell</dt>
          <dd className="text-xl font-semibold">
            {streak.current} {streak.current === 1 ? "Tag" : "Tage"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Rekord</dt>
          <dd className="text-xl font-semibold">
            {streak.record} {streak.record === 1 ? "Tag" : "Tage"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

// --- Forecast ------------------------------------------------------------

function ForecastSection({ forecast }: { forecast: readonly ForecastDay[] }) {
  const total = forecast.reduce((s, d) => s + d.count, 0);
  return (
    <section className="space-y-2" data-testid="stats-forecast">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Fällig in den nächsten 7 Tagen
      </h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500">Keine Cards in den nächsten 7 Tagen fällig.</p>
      ) : (
        <ul className="grid grid-cols-7 gap-1 text-center">
          {forecast.map((d, i) => (
            <li key={d.day} className="space-y-1">
              <div className="rounded-md border border-slate-200 px-1 py-2 text-sm dark:border-slate-800">
                <div className="font-medium">{d.count}</div>
              </div>
              <div className="text-[10px] text-slate-500">{shortDayLabel(d.day, i)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function shortDayLabel(dayKey: string, index: number): string {
  if (index === 0) return "Heute";
  if (index === 1) return "Morgen";
  // `dayKey` is `YYYY-MM-DD`; parse and grab the weekday.
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-DE", { weekday: "short" });
}

// --- Distribution --------------------------------------------------------

function DistributionSection({
  distribution,
  range,
}: {
  distribution: RatingDistribution;
  range: RangePreset;
}) {
  const order: Rating[] = ["again", "hard", "good", "easy"];
  const total = order.reduce((s, r) => s + distribution[r], 0);
  return (
    <section className="space-y-2" data-testid="stats-distribution">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Antwort-Verteilung ({RANGE_LABELS[range]})
      </h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500">Keine Antworten im gewählten Zeitraum.</p>
      ) : (
        <ul className="space-y-1">
          {order.map((rating) => {
            const count = distribution[rating];
            const pct = total === 0 ? 0 : Math.round((count / total) * 100);
            return (
              <li key={rating} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-slate-600 dark:text-slate-300">
                  {RATING_LABELS[rating]}
                </span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  role="progressbar"
                  aria-label={`${RATING_LABELS[rating]}: ${pct} Prozent`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  tabIndex={0}
                >
                  <div
                    className="h-full bg-slate-700 dark:bg-slate-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 text-right text-xs tabular-nums text-slate-500">
                  {count} · {pct} %
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- Empty state --------------------------------------------------------

function EmptyState() {
  return (
    <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
      Noch keine Reviews — starte eine Review-Session, dann erscheinen hier deine Statistiken.
    </p>
  );
}
