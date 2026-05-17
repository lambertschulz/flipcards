import { listAllDueCards } from "@/db/review-states";
import { dueCardsForTagAnd } from "@/domain/tags";
import { ReviewSessionRunner } from "@/features/review/review-session-runner";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export function TagSessionReviewPage({ tags }: { tags: string[] }) {
  const navigate = useNavigate();
  const backToPicker = useCallback(() => navigate({ to: "/tag-session" }), [navigate]);

  const tagSet = useMemo(() => Array.from(new Set(tags)).filter((t) => t.length > 0), [tags]);

  const loadDueCards = useCallback(async () => {
    if (tagSet.length === 0) return [];
    const due = await listAllDueCards(Date.now());
    // ADR-0014 invariant: a card with a pending-delete op (direct or via
    // deck-cascade) must not be reachable as a "due card" during the 10s
    // undo window — otherwise the session queue would surface a card that
    // visually no longer exists in the app.
    //
    // We filter on BOTH the card's own `card:<id>` and its parent
    // `deck:<deckId>`. The card-key alone is not enough: a deck-delete op
    // snapshots cascade-keys at enqueue-time, so a card created AFTER enqueue
    // through a stale `/deck/:id/card/new` route would not have a `card:<id>`
    // match — but its parent `deck:<deckId>` still hits. Filtering at
    // read-time covers that race without mutating cascade keys post-enqueue.
    const store = getPendingDeletes();
    const visible = due.filter(
      (c) => !store.isPending(`card:${c.id}`) && !store.isPending(`deck:${c.deckId}`),
    );
    return dueCardsForTagAnd(visible, tagSet);
  }, [tagSet]);

  if (tagSet.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Keine Tags ausgewählt</h2>
        <Link to="/tag-session" className="text-sm underline">
          Zurück zum Tag-Picker
        </Link>
      </section>
    );
  }

  const title = tagSet.join(" · ");

  return (
    <ReviewSessionRunner
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Lernen — {title}</h2>
          <Link to="/tag-session" className="text-sm underline">
            Zurück zum Tag-Picker
          </Link>
        </div>
      }
      loadDueCards={loadDueCards}
      onBack={backToPicker}
      emptyMessage="Keine Cards fällig für diese Tag-Auswahl."
    />
  );
}
