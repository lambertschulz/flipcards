import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { CardEditor } from "@/features/card/card-editor";
import { useGlobalTags } from "@/features/card/use-global-tags";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { useIsPendingDelete, useVisibleDeck } from "@/lib/pending-deletes-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function CardCreatePage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const suggestions = useGlobalTags();

  // ADR-0014: the /deck/:deckId/card/new route is reachable by direct URL
  // or browser back-nav during the 10s undo window after a deck-delete.
  // If the user lands here while the parent deck is pending-deleted (or
  // committed and removed), `createCardInDb` would otherwise create an
  // orphan Card pointing at a non-existent Deck — and once the deck-delete
  // commits, the parent `deck:<id>` op leaves the pending set, so the
  // orphan card surfaces in tag-session and due-card reads.
  //
  // Page-level guard: subscribe to `deck:<deckId>` and `useVisibleDeck`,
  // redirect home when either flags pending or the deck has been removed
  // entirely. Mirrors the deck-detail-page and card-edit-page patterns.
  const deck = useVisibleDeck(deckId);
  const parentDeckPending = useIsPendingDelete(`deck:${deckId}`);
  const hidden = parentDeckPending || deck === undefined;

  useEffect(() => {
    if (hidden && deck !== null) {
      // `deck === null` means the visible-deck hook is still loading; only
      // redirect once we've seen the row resolve (undefined = pending or
      // gone, defined = visible).
      void navigate({ to: "/" });
    }
  }, [hidden, deck, navigate]);

  const back = () => navigate({ to: "/deck/$deckId", params: { deckId } });

  if (deck === null) {
    return <p className="text-sm text-slate-500">Lade Deck…</p>;
  }
  if (hidden) {
    // Render nothing while the navigate effect resolves.
    return null;
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Neue Card</h2>
        <Link
          to="/deck/$deckId"
          params={{ deckId }}
          className="text-sm underline underline-offset-4"
        >
          Zurück zum Deck
        </Link>
      </div>
      <CardEditor
        mode="create"
        initial={{ front: "", back: "", tags: [] }}
        suggestions={suggestions}
        onCancel={back}
        onSave={async (values) => {
          // Defence-in-depth: re-check parent visibility right before the
          // write. The page-level guard normally catches this, but a delete
          // op could be enqueued in the gap between render and submit.
          const store = getPendingDeletes();
          if (store.isPending(`deck:${deckId}`)) return;
          const parent = await db.decks.get(deckId);
          if (!parent) return;
          await createCardInDb({ deckId, ...values });
          await back();
        }}
      />
    </section>
  );
}
