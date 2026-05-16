import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";

export function DeckDetailPage({ deckId }: { deckId: string }) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);
  const deckSet = useLiveQuery(
    async () => (deck?.deckSetId ? await db.deckSets.get(deck.deckSetId) : undefined),
    [deck?.deckSetId],
    undefined,
  );

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
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{deck.name}</h2>
          {deckSet ? (
            <p className="text-sm text-slate-500">Deck-Set: {deckSet.name}</p>
          ) : (
            <p className="text-sm text-slate-500">Lose (keinem Deck-Set zugeordnet)</p>
          )}
        </div>
        <Link to="/deck/$deckId/settings" params={{ deckId: deck.id }}>
          <Button variant="outline">Deck-Einstellungen</Button>
        </Link>
      </div>

      {deck.description ? (
        <p className="whitespace-pre-line text-slate-700 dark:text-slate-300">{deck.description}</p>
      ) : null}

      <p className="text-sm text-slate-500">
        Cards werden in einem späteren Ticket hinzugefügt (siehe #5).
      </p>
    </section>
  );
}
