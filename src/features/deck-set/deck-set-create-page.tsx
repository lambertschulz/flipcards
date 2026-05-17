import { createDeckSetInDb } from "@/db/deck-sets";
import { DeckSetForm } from "@/features/deck-set/deck-set-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function DeckSetCreatePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-lg font-medium">Neues Deck-Set</h2>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <DeckSetForm
        submitLabel="Erstellen"
        busy={busy}
        onCancel={() => navigate({ to: "/" })}
        onSubmit={async ({ name, description }) => {
          setBusy(true);
          setError(null);
          try {
            const set = await createDeckSetInDb({ name, description });
            await navigate({ to: "/deck-set/$deckSetId", params: { deckSetId: set.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
