import { getCard, updateCardInDb } from "@/db/cards";
import type { Card } from "@/domain/card";
import { CardEditor } from "@/features/card/card-editor";
import { useGlobalTags } from "@/features/card/use-global-tags";
import { useIsPendingDelete } from "@/lib/pending-deletes-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export function CardEditPage({ deckId, cardId }: { deckId: string; cardId: string }) {
  const navigate = useNavigate();
  const suggestions = useGlobalTags();
  const [card, setCard] = useState<Card | null | undefined>(null);
  // Snapshot of the card at the moment the user opened the editor. Discard
  // restores this back to the database (auto-save means the live card may
  // have drifted since open — the brief asks for "revert since opening").
  const [snapshot, setSnapshot] = useState<Card | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  // ADR-0014: the card-edit route is reachable by direct URL or browser
  // back-nav during the 10s undo window after a card-delete. We mirror the
  // page-level guard the deck-detail-page uses for pending-deleted decks:
  // subscribe to `card:<id>` (and the cascade parent `deck:<deckId>`), and
  // when either is in the pending-delete window, redirect to the deck-detail
  // page so the user sees the toast and not a corpse editor.
  const cardIsPending = useIsPendingDelete(`card:${cardId}`);
  const parentDeckPending = useIsPendingDelete(`deck:${deckId}`);
  const hidden = cardIsPending || parentDeckPending;

  useEffect(() => {
    let cancelled = false;
    getCard(cardId).then((c) => {
      if (cancelled) return;
      setCard(c);
      if (c) setSnapshot(c);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  useEffect(() => {
    if (hidden) {
      void navigate({ to: "/deck/$deckId", params: { deckId } });
    }
  }, [hidden, navigate, deckId]);

  const back = () => navigate({ to: "/deck/$deckId", params: { deckId } });

  if (hidden) {
    // Render nothing while the navigate effect resolves — the row is also
    // hidden in the deck-detail list, so the user only sees the toast.
    return null;
  }
  if (card === null) {
    return <p className="text-sm text-slate-500">Lade Card…</p>;
  }
  if (card === undefined) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Card nicht gefunden</h2>
        <Link to="/deck/$deckId" params={{ deckId }} className="text-sm underline">
          Zurück zum Deck
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Card bearbeiten</h2>
        <Link
          to="/deck/$deckId"
          params={{ deckId }}
          className="text-sm underline underline-offset-4"
        >
          Zurück zum Deck
        </Link>
      </div>
      <CardEditor
        key={editorKey}
        mode="edit"
        initial={{
          front: snapshot?.front ?? card.front,
          back: snapshot?.back ?? card.back,
          tags: snapshot?.tags ?? card.tags,
        }}
        suggestions={suggestions}
        onCancel={back}
        onSave={async (values) => {
          const next = await updateCardInDb(card.id, values);
          setCard(next);
        }}
        onDiscard={async () => {
          if (!snapshot) return;
          const reverted = await updateCardInDb(card.id, {
            front: snapshot.front,
            back: snapshot.back,
            tags: snapshot.tags,
          });
          setCard(reverted);
          setEditorKey((k) => k + 1);
        }}
      />
    </section>
  );
}
