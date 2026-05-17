import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { getReviewState, putReviewState } from "@/db/review-states";
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
import { CardEditModal } from "@/features/review/card-edit-modal";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

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

export interface ReviewSessionRunnerProps {
  /** Visible session-header content (title + a "back" affordance). */
  header: ReactNode;
  /** Loader for due cards. Called when the user starts a session. */
  loadDueCards: () => Promise<Card[]>;
  /** Callback for the "back" button shown in the empty + done states. */
  onBack: () => void;
  /** Label for the empty-state body — different copy for deck vs. tag flows. */
  emptyMessage: string;
}

/**
 * Stateful review-session UI shared by Deck-Sessions and Tag-Sessions.
 *
 * The runner owns the phase machine (choose -> reviewing -> done | empty),
 * the queue, the answer history, persistence (review-state + review-log),
 * the flip/rating keyboard shortcuts, and the edit-during-review modal.
 *
 * It deliberately knows nothing about *where* the due cards come from —
 * that's the caller's job (see `ReviewSessionPage` for deck-source and
 * `TagSessionReviewPage` for the AND-tag-filter source). All Tag-Session
 * cards flow through the same `appendReview` path so ADR-0012 stats stay
 * single-bookkeeping.
 */
export function ReviewSessionRunner({
  header,
  loadDueCards,
  onBack,
  emptyMessage,
}: ReviewSessionRunnerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [answers, setAnswers] = useState<AnswerEvent[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The id of the card currently being edited in the modal, or null when no
  // edit is open. We deliberately keep this state local to the page (not in
  // `phase`) so that opening / closing the modal can never invalidate the
  // session queue (issue #6).
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const startSession = useCallback(
    async (mode: SessionMode) => {
      setError(null);
      try {
        const due = await loadDueCards();
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
    [loadDueCards],
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

  /**
   * Splice an edited card into the live session queue without disturbing the
   * queue position, the answer history, or the SRS state. Used when the user
   * fixes a typo via the edit-modal (issue #6).
   */
  const handleCardUpdated = useCallback((next: Card) => {
    setPhase((p) => {
      if (p.kind !== "reviewing") return p;
      const nextQueue = p.queue.map((c) => (c.id === next.id ? next : c));
      return { ...p, queue: nextQueue };
    });
  }, []);

  // Keyboard: Space flips the card; 1-4 rate the back side. While the
  // edit-modal is open we short-circuit the handler so that keys bubbling
  // out of the modal (e.g. 1-4 on a focused button, Space on a tab) cannot
  // rate or flip the underlying session card — that would break the
  // modal's no-session-mutation invariant (issue #6, codex review).
  useEffect(() => {
    if (phase.kind !== "reviewing") return;
    if (editingCardId !== null) return;
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
  }, [phase, flip, answer, editingCardId]);

  return (
    <section className="mx-auto max-w-xl space-y-4">
      {header}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {phase.kind === "choose" ? <SessionStart onStart={startSession} /> : null}
      {phase.kind === "empty" ? <SessionEmpty message={emptyMessage} onBack={onBack} /> : null}
      {phase.kind === "reviewing" ? (
        <ReviewCardView
          phase={phase}
          totalAnswered={answers.length}
          onFlip={flip}
          onAnswer={answer}
          onEnd={endNow}
          onEdit={() => setEditingCardId(phase.queue[phase.index].id)}
        />
      ) : null}
      {phase.kind === "reviewing" && editingCardId !== null
        ? (() => {
            const cardToEdit = phase.queue.find((c) => c.id === editingCardId);
            if (!cardToEdit) return null;
            return (
              <CardEditModal
                card={cardToEdit}
                onCardUpdated={handleCardUpdated}
                onClose={() => setEditingCardId(null)}
              />
            );
          })()
        : null}
      {phase.kind === "done" ? (
        <SessionEnd
          summary={summarize(answers)}
          durationMs={(endedAt ?? Date.now()) - (startedAt ?? Date.now())}
          onRetry={() => startSession({ kind: "open-ended" })}
          onBack={onBack}
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

function SessionEmpty({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <output className="block rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <p className="mb-3 text-slate-600 dark:text-slate-400">{message}</p>
      <Button onClick={onBack}>Zurück</Button>
    </output>
  );
}

function ReviewCardView({
  phase,
  totalAnswered,
  onFlip,
  onAnswer,
  onEnd,
  onEdit,
}: {
  phase: Extract<Phase, { kind: "reviewing" }>;
  totalAnswered: number;
  onFlip: () => void;
  onAnswer: (rating: Rating) => void;
  onEnd: () => void;
  onEdit: () => void;
}) {
  const card = phase.queue[phase.index];
  const totalForFooter = totalAnswered + phase.queue.length;
  const positionForFooter = totalAnswered + 1;

  return (
    <div className="space-y-4">
      <div className="relative">
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
          className="block w-full min-h-[40vh] cursor-pointer rounded-md border border-slate-200 bg-white p-4 pr-14 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-950"
        >
          <MarkdownView source={phase.showBack ? card.back : card.front} />
          {!phase.showBack ? (
            <p className="mt-4 text-xs text-slate-500">Tippen, Space oder Enter zum Umdrehen</p>
          ) : (
            <hr className="my-4 border-slate-200 dark:border-slate-800" />
          )}
        </div>
        {/* Edit-affordance: pencil-icon, always visible during review (front &
            back). Click bubbling is stopped so tapping it does NOT flip the
            card. Touch-target ≥ 44 px per ADR-0009. See issue #6. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label="Card bearbeiten"
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <PencilIcon />
        </button>
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

function PencilIcon() {
  // Inline SVG keeps the bundle free of an icon dependency. 20×20 inside the
  // 44×44 touch-target hit area so the glyph stays readable while the tap
  // surface stays comfortable on mobile (ADR-0009).
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <title>Bearbeiten</title>
      <path d="M4 16v-2.5L12.5 5l2.5 2.5L6.5 16H4z" />
      <path d="M11.5 6L14 8.5" />
    </svg>
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
          Zurück
        </Button>
      </div>
    </div>
  );
}
