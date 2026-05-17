import { db } from "@/db/database";
import { updateDeckSetInDb } from "@/db/deck-sets";
import { DeckSetForm } from "@/features/deck-set/deck-set-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

export function DeckSetSettingsPage({ deckSetId }: { deckSetId: string }) {
  const navigate = useNavigate();
  const set = useLiveQuery(() => db.deckSets.get(deckSetId), [deckSetId], null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </section>
  );
}
