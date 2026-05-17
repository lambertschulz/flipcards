import { db } from "@/db/database";
import { listDueCardsInDeck } from "@/db/review-states";
import { ReviewSessionRunner } from "@/features/review/review-session-runner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback } from "react";

export function ReviewSessionPage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);

  const backToDeck = useCallback(
    () => navigate({ to: "/deck/$deckId", params: { deckId } }),
    [navigate, deckId],
  );

  const loadDueCards = useCallback(() => listDueCardsInDeck(deckId, Date.now()), [deckId]);

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
    <ReviewSessionRunner
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Lernen — {deck.name}</h2>
          <Link to="/deck/$deckId" params={{ deckId }} className="text-sm underline">
            Zurück zum Deck
          </Link>
        </div>
      }
      loadDueCards={loadDueCards}
      onBack={backToDeck}
      emptyMessage="Keine Cards fällig. Komm später wieder oder lerne deck-übergreifend per Tag."
    />
  );
}
