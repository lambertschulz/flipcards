import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { StorageQuotaBanner } from "@/features/storage/storage-quota-banner";
import { usePendingDeletes } from "@/lib/pending-deletes-react";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";

export function DeckListPage() {
  const decks = useLiveQuery(() => db.decks.orderBy("name").toArray(), [], undefined);
  const pending = usePendingDeletes();
  const pendingDeckKeys = new Set(
    pending.filter((o) => o.state === "pending" && o.key.startsWith("deck:")).map((o) => o.key),
  );

  const visibleDecks =
    decks === undefined ? undefined : decks.filter((d) => !pendingDeckKeys.has(`deck:${d.id}`));

  return (
    <section className="space-y-4">
      <StorageQuotaBanner />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Decks</h2>
        <Link to="/deck/new">
          <Button>+ Neues Deck</Button>
        </Link>
      </div>

      {visibleDecks === undefined ? (
        <p className="text-sm text-slate-500">Lade Decks…</p>
      ) : visibleDecks.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="mb-3 text-slate-600 dark:text-slate-400">Noch keine Decks angelegt.</p>
          <Link to="/deck/new">
            <Button>Erstes Deck anlegen</Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visibleDecks.map((deck) => (
            <li key={deck.id}>
              <Link
                to="/deck/$deckId"
                params={{ deckId: deck.id }}
                className="flex min-h-[44px] items-center px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span className="flex-1 truncate">{deck.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
