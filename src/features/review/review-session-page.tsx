import { db } from "@/db/database";
import { listDueCardsInDeck } from "@/db/review-states";
import { ReviewSessionRunner } from "@/features/review/review-session-runner";
import { getPendingDeletes } from "@/lib/pending-deletes";
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

  const loadDueCards = useCallback(async () => {
    const store = getPendingDeletes();
    // Defensive: if the deck itself is pending-deleted (the user opened a
    // per-deck session via a stale back-button during the 10s window), the
    // session must show empty rather than render against doomed data.
    if (store.isPending(`deck:${deckId}`)) return [];
    const due = await listDueCardsInDeck(deckId, Date.now());
    // Per-card pending filter — covers a card the user deleted from the
    // detail page while a session loader was already racing.
    return due.filter((c) => !store.isPending(`card:${c.id}`));
  }, [deckId]);

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
