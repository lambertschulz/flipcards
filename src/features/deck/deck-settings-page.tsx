import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { moveDeckToSetInDb, updateDeckInDb } from "@/db/decks";
import { deleteDeckWithCascade, restoreDeletedDeck } from "@/db/deletion";
import { DeckForm } from "@/features/deck/deck-form";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

export function DeckSettingsPage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);
  const deckSets = useLiveQuery(() => db.deckSets.orderBy("name").toArray(), [], []);
  const cardCount = useLiveQuery(
    () => db.cards.where("deckId").equals(deckId).count(),
    [deckId],
    0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (deck === null) {
    return <p className="text-sm text-slate-500">Lade Deck…</p>;
  }
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
      <h2 className="text-lg font-medium">Deck-Einstellungen</h2>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <DeckForm
        initial={{
          name: deck.name,
          description: deck.description ?? "",
          deckSetId: deck.deckSetId ?? null,
        }}
        deckSets={deckSets}
        submitLabel="Speichern"
        busy={busy}
        onCancel={() => navigate({ to: "/deck/$deckId", params: { deckId: deck.id } })}
        onSubmit={async ({ name, description, deckSetId }) => {
          setBusy(true);
          setError(null);
          try {
            await updateDeckInDb(deck.id, { name, description });
            if ((deck.deckSetId ?? null) !== deckSetId) {
              await moveDeckToSetInDb(deck.id, deckSetId);
            }
            await navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
            setBusy(false);
          }
        }}
      />

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 className="text-base font-medium text-red-700 dark:text-red-300">Gefahrenzone</h3>
        <p className="mb-3 mt-1 text-sm text-slate-600 dark:text-slate-400">
          Das Deck und alle enthaltenen Cards werden mit 10s-Undo gelöscht.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
          aria-label="Deck löschen"
        >
          Deck löschen
        </Button>
      </div>

      <ConfirmDeleteModal
        open={showDeleteModal}
        title="Deck löschen?"
        body={
          <p>
            Deck <strong>„{deck.name}"</strong> und seine <strong>{cardCount}</strong>{" "}
            {cardCount === 1 ? "Card" : "Cards"} löschen? Du kannst die Aktion 10 Sekunden lang
            rückgängig machen.
          </p>
        }
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          setShowDeleteModal(false);
          const store = getPendingDeletes();
          let snapshot: Awaited<ReturnType<typeof deleteDeckWithCascade>> | null = null;
          store.enqueue({
            key: `deck:${deck.id}`,
            label: `Deck „${deck.name}" gelöscht`,
            commit: async () => {
              snapshot = await deleteDeckWithCascade(deck.id);
            },
            restore: async () => {
              if (snapshot) await restoreDeletedDeck(snapshot);
            },
          });
          // Optimistic navigate back to the deck list — the deck-list page
          // filters out pending-deleted decks so the row vanishes immediately.
          void navigate({ to: "/" });
        }}
      />
    </section>
  );
}
