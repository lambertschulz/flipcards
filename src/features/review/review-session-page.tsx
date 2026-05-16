import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { getReviewState, listDueCardsInDeck, putReviewState } from "@/db/review-states";
import { appendReview } from "@/db/reviews";
import type { Card } from "@/domain/card";
import {
  type AnswerEvent,
  type SessionMode,
  type SessionSummary,
  buildSessionQueue,
  requeueIfAgain,
  summarize,
} from "@/domain/session";
import { type Rating, type ReviewState, scheduleNext } from "@/domain/sm2";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase =
  | { kind: "choose" }
  | { kind: "empty" }
  | { kind: "reviewing"; queue: Card[]; index: number; showBack: boolean }
  | { kind: "done" };

const ratingButtons: {
  rating: Rating;
  label: string;
  key: string;
  variant: "outline" | "default";
}[] = [
  { rating: "again", label: "1 Again", key: "1", variant: "outline" },
  { rating: "hard", label: "2 Hard", key: "2", variant: "outline" },
  { rating: "good", label: "3 Good", key: "3", variant: "default" },
  { rating: "easy", label: "4 Easy", key: "4", variant: "outline" },
];

export function ReviewSessionPage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);

  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [answers, setAnswers] = useState<AnswerEvent[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const backToDeck = useCallback(
    () => navigate({ to: "/deck/$deckId", params: { deckId } }),
    [navigate, deckId],
  );

  const startSession = useCallback(
    async (mode: SessionMode) => {
      setError(null);
      try {
        const due = await listDueCardsInDeck(deckId, Date.now());
        if (due.length === 0) {
          setPhase({ kind: "empty" });
          return;
        }
        const queue = buildSessionQueue(due, mode);
        setAnswers([]);
        setStartedAt(Date.now());
        setEndedAt(null);
        setPhase({ kind: "reviewing", queue, index: 0, showBack: false });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [deckId],
  );

  const flip = useCallback(() => {
    setPhase((p) => (p.kind === "reviewing" && !p.showBack ? { ...p, showBack: true } : p));
  }, []);

  const answer = useCallback(async (rating: Rating) => {
    const current = phaseRef.current;
    if (current.kind !== "reviewing" || !current.showBack) return;
    const card = current.queue[current.index];

    const now = Date.now();
    const priorState = await getReviewState(card.id);
    const nextState = scheduleNext(priorState, rating, now);
    await persistAnswer(card.id, nextState, rating, now);

    setAnswers((prev) => [...prev, { cardId: card.id, rating }]);

    const remaining = current.queue.slice(current.index + 1);
    const nextQueue = requeueIfAgain(remaining, card, rating);

    if (nextQueue.length === 0) {
      setEndedAt(Date.now());
      setPhase({ kind: "done" });
      return;
    }
    setPhase({ kind: "reviewing", queue: nextQueue, index: 0, showBack: false });
  }, []);

  const endNow = useCallback(() => {
    setEndedAt(Date.now());
    setPhase({ kind: "done" });
  }, []);

  // Keyboard: Space flips the card; 1-4 rate the back side.
  useEffect(() => {
    if (phase.kind !== "reviewing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!phase.showBack && (e.code === "Space" || e.key === " ")) {
        e.preventDefault();
        flip();
        return;
      }
      if (phase.showBack) {
        const hit = ratingButtons.find((b) => b.key === e.key);
        if (hit) {
          e.preventDefault();
          void answer(hit.rating);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, flip, answer]);

  if (deck === null) return <p className="text-sm text-slate-500">Lade Deck…</p>;
  if (deck === undefined) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Deck nicht gefunden</h2>
        <Link to="/" className="text-sm underline">
          Zurück zur Deck-Liste
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Lernen — {deck.name}</h2>
        <Link to="/deck/$deckId" params={{ deckId }} className="text-sm underline">
          Zurück zum Deck
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {phase.kind === "choose" ? <SessionStart onStart={startSession} /> : null}
      {phase.kind === "empty" ? <SessionEmpty onBack={backToDeck} /> : null}
      {phase.kind === "reviewing" ? (
        <ReviewCardView
          phase={phase}
          totalAnswered={answers.length}
          onFlip={flip}
          onAnswer={answer}
          onEnd={endNow}
        />
      ) : null}
      {phase.kind === "done" ? (
        <SessionEnd
          summary={summarize(answers)}
          durationMs={(endedAt ?? Date.now()) - (startedAt ?? Date.now())}
          onRetry={() => startSession({ kind: "open-ended" })}
          onBack={backToDeck}
        />
      ) : null}
    </section>
  );
}

async function persistAnswer(
  cardId: string,
  next: ReviewState,
  rating: Rating,
  timestamp: number,
): Promise<void> {
  await putReviewState(cardId, next);
  await appendReview({
    cardId,
    timestamp,
    rating,
    intervalAfter: next.intervalDays,
    easeAfter: next.easeFactor,
  });
}

function SessionStart({ onStart }: { onStart: (mode: SessionMode) => void }) {
  const [count, setCount] = useState(20);
  return (
    <div className="space-y-4 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Wie viele Cards möchtest du lernen?
      </p>
      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={() => onStart({ kind: "open-ended" })}>
          Open-ended — bis ich aufhöre
        </Button>
        <div className="flex items-center gap-2">
          <label htmlFor="bounded-count" className="sr-only">
            Card-Anzahl
          </label>
          <input
            id="bounded-count"
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-md border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
          <Button size="lg" variant="outline" onClick={() => onStart({ kind: "bounded", count })}>
            Bounded — {count} Cards
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionEmpty({ onBack }: { onBack: () => void }) {
  return (
    <output className="block rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <p className="mb-3 text-slate-600 dark:text-slate-400">
        Keine Cards fällig. Komm später wieder oder lerne deck-übergreifend per Tag.
      </p>
      <Button onClick={onBack}>Zurück zum Deck</Button>
    </output>
  );
}

function ReviewCardView({
  phase,
  totalAnswered,
  onFlip,
  onAnswer,
  onEnd,
}: {
  phase: Extract<Phase, { kind: "reviewing" }>;
  totalAnswered: number;
  onFlip: () => void;
  onAnswer: (rating: Rating) => void;
  onEnd: () => void;
}) {
  const card = phase.queue[phase.index];
  const totalForFooter = totalAnswered + phase.queue.length;
  const positionForFooter = totalAnswered + 1;

  return (
    <div className="space-y-4">
      {/* The face uses role="button" rather than a real <button> so block-level
          markdown content can render inside without producing invalid nested
          interactive elements. */}
      <div
        role={phase.showBack ? undefined : "button"}
        tabIndex={phase.showBack ? -1 : 0}
        onClick={phase.showBack ? undefined : onFlip}
        onKeyDown={(e) => {
          if (!phase.showBack && (e.code === "Space" || e.key === "Enter")) {
            e.preventDefault();
            onFlip();
          }
        }}
        aria-label={phase.showBack ? undefined : "Vorderseite der Card — antippen zum Umdrehen"}
        className="block w-full min-h-[40vh] cursor-pointer rounded-md border border-slate-200 bg-white p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-950"
      >
        <MarkdownView source={phase.showBack ? card.back : card.front} />
        {!phase.showBack ? (
          <p className="mt-4 text-xs text-slate-500">Tippen, Space oder Enter zum Umdrehen</p>
        ) : (
          <hr className="my-4 border-slate-200 dark:border-slate-800" />
        )}
      </div>

      {phase.showBack ? (
        <fieldset className="grid grid-cols-2 gap-2 border-0 p-0 sm:grid-cols-4">
          <legend className="sr-only">Antwort</legend>
          {ratingButtons.map((b) => (
            <Button key={b.rating} size="lg" variant={b.variant} onClick={() => onAnswer(b.rating)}>
              {b.label}
            </Button>
          ))}
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {positionForFooter} / {totalForFooter} Cards
        </span>
        <button
          type="button"
          onClick={onEnd}
          className="underline underline-offset-4 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Genug für heute
        </button>
      </div>
    </div>
  );
}

function SessionEnd({
  summary,
  durationMs,
  onRetry,
  onBack,
}: {
  summary: SessionSummary;
  durationMs: number;
  onRetry: () => void;
  onBack: () => void;
}) {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  const durationLabel = minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;

  return (
    <div className="space-y-4 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-base font-medium">Session beendet</h3>
      <p className="text-slate-700 dark:text-slate-300">
        {summary.total} Cards in {durationLabel}.
      </p>
      <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
        <li>Again: {summary.byRating.again}</li>
        <li>Hard: {summary.byRating.hard}</li>
        <li>Good: {summary.byRating.good}</li>
        <li>Easy: {summary.byRating.easy}</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry}>Nochmal</Button>
        <Button variant="outline" onClick={onBack}>
          Zurück zum Deck
        </Button>
      </div>
    </div>
  );
}
