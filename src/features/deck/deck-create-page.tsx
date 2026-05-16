import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { DeckForm } from "@/features/deck/deck-form";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

export function DeckCreatePage() {
  const navigate = useNavigate();
  const deckSets = useLiveQuery(() => db.deckSets.orderBy("name").toArray(), [], []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-lg font-medium">Neues Deck</h2>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <DeckForm
        deckSets={deckSets}
        submitLabel="Erstellen"
        busy={busy}
        onCancel={() => navigate({ to: "/" })}
        onSubmit={async ({ name, description, deckSetId }) => {
          setBusy(true);
          setError(null);
          try {
            const deck = await createDeckInDb({ name, description, deckSetId });
            await navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
