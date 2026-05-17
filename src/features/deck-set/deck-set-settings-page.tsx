import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { updateDeckSetInDb } from "@/db/deck-sets";
import { deleteDeckSetWithCascade, restoreDeletedDeckSet } from "@/db/deletion";
import { DeckSetForm } from "@/features/deck-set/deck-set-form";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

export function DeckSetSettingsPage({ deckSetId }: { deckSetId: string }) {
  const navigate = useNavigate();
  const set = useLiveQuery(() => db.deckSets.get(deckSetId), [deckSetId], null);
  const memberCount = useLiveQuery(
    () => db.decks.where("deckSetId").equals(deckSetId).count(),
    [deckSetId],
    0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (set === null) {
    return <p className="text-sm text-slate-500">Lade Deck-Set…</p>;
  }
  if (set === undefined) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Deck-Set nicht gefunden</h2>
        <Link to="/" className="text-sm underline">
          Zurück zur Deck-Liste
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-lg font-medium">Deck-Set-Einstellungen</h2>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <DeckSetForm
        initial={{ name: set.name, description: set.description ?? "" }}
        submitLabel="Speichern"
        busy={busy}
        onCancel={() => navigate({ to: "/deck-set/$deckSetId", params: { deckSetId: set.id } })}
        onSubmit={async ({ name, description }) => {
          setBusy(true);
          setError(null);
          try {
            await updateDeckSetInDb(set.id, { name, description });
            await navigate({ to: "/deck-set/$deckSetId", params: { deckSetId: set.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
            setBusy(false);
          }
        }}
      />

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 className="text-base font-medium text-red-700 dark:text-red-300">Gefahrenzone</h3>
        <p className="mb-3 mt-1 text-sm text-slate-600 dark:text-slate-400">
          Das Deck-Set wird mit 10s-Undo entfernt. Enthaltene Decks bleiben als eigenständige Decks
          erhalten.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
          aria-label="Deck-Set löschen"
        >
          Deck-Set löschen
        </Button>
      </div>

      <ConfirmDeleteModal
        open={showDeleteModal}
        title="Deck-Set löschen?"
        body={
          <p>
            Deck-Set <strong>„{set.name}"</strong> entfernen? Die <strong>{memberCount}</strong>{" "}
            enthaltenen Decks bleiben als eigenständige Decks erhalten. Du kannst die Aktion 10
            Sekunden lang rückgängig machen.
          </p>
        }
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          setShowDeleteModal(false);
          // Deck-Set delete cascade per ADR-0014: the set vanishes but its
          // member decks survive as lose decks. We therefore DON'T add the
          // member decks as cascade keys — they should *not* be hidden from
          // the home screen during the undo window. Only the deck-set key is
          // marked pending.
          const store = getPendingDeletes();
          let snapshot: Awaited<ReturnType<typeof deleteDeckSetWithCascade>> | null = null;
          store.enqueue({
            key: `deck-set:${set.id}`,
            label: `Deck-Set „${set.name}" entfernt`,
            commit: async () => {
              snapshot = await deleteDeckSetWithCascade(set.id);
            },
            restore: async () => {
              if (snapshot) await restoreDeletedDeckSet(snapshot);
            },
          });
          // Optimistic navigate back to home — the home screen filters out
          // pending-deleted deck-sets so the entry vanishes immediately.
          void navigate({ to: "/" });
        }}
      />
    </section>
  );
}
