import { db } from "@/db/database";
import { moveDeckToSetInDb, updateDeckInDb } from "@/db/decks";
import { DeckForm } from "@/features/deck/deck-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

export function DeckSettingsPage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);
  const deckSets = useLiveQuery(() => db.deckSets.orderBy("name").toArray(), [], []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </section>
  );
}
