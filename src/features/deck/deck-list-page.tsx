import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { StorageQuotaBanner } from "@/features/storage/storage-quota-banner";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * Deck list view. Decks are grouped by Deck-Set (groups appear sorted by
 * set name) and lose decks land in their own section at the bottom. The
 * two-level grouping mirrors ADR-0003 (Card → Deck → optional Deck-Set,
 * no nesting).
 */
export function DeckListPage() {
  const decks = useLiveQuery(() => db.decks.orderBy("name").toArray(), [], undefined);
  const deckSets = useLiveQuery(() => db.deckSets.orderBy("name").toArray(), [], undefined);

  const loading = decks === undefined || deckSets === undefined;
  const hasAny = !loading && (decks.length > 0 || deckSets.length > 0);

  return (
    <section className="space-y-4">
      <StorageQuotaBanner />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Decks</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/deck-set/new">
            <Button variant="outline">+ Neues Deck-Set</Button>
          </Link>
          <Link to="/deck/new">
            <Button>+ Neues Deck</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Lade Decks…</p>
      ) : !hasAny ? (
        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="mb-3 text-slate-600 dark:text-slate-400">Noch keine Decks angelegt.</p>
          <Link to="/deck/new">
            <Button>Erstes Deck anlegen</Button>
          </Link>
        </div>
      ) : (
        <DeckGroups decks={decks} deckSets={deckSets} />
      )}
    </section>
  );
}

function DeckGroups({
  decks,
  deckSets,
}: {
  decks: { id: string; name: string; deckSetId?: string }[];
  deckSets: { id: string; name: string; description?: string }[];
}) {
  // IndexedDB has no FK enforcement, so a deck's deckSetId may reference a
  // set that no longer exists (stale import, partial restore, prior bug).
  // Treat such orphan references as lose decks so the deck stays visible
  // and the user can re-assign or clear the broken id from settings.
  const knownSetIds = new Set(deckSets.map((s) => s.id));
  const decksBySet = new Map<string | "__lose", typeof decks>();
  for (const deck of decks) {
    const key =
      deck.deckSetId !== undefined && knownSetIds.has(deck.deckSetId) ? deck.deckSetId : "__lose";
    const list = decksBySet.get(key);
    if (list) list.push(deck);
    else decksBySet.set(key, [deck]);
  }

  const loseDecks = decksBySet.get("__lose") ?? [];

  return (
    <div className="space-y-6">
      {deckSets.map((set) => {
        const members = decksBySet.get(set.id) ?? [];
        return (
          <section key={set.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-medium">
                <Link
                  to="/deck-set/$deckSetId"
                  params={{ deckSetId: set.id }}
                  className="hover:underline"
                >
                  {set.name}
                </Link>
              </h3>
              <span className="text-xs text-slate-500">
                {members.length === 1 ? "1 Deck" : `${members.length} Decks`}
              </span>
            </div>
            {members.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700">
                Keine Decks in diesem Set.
              </p>
            ) : (
              <DeckList decks={members} />
            )}
          </section>
        );
      })}

      {loseDecks.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-base font-medium text-slate-500">Lose Decks</h3>
          <DeckList decks={loseDecks} />
        </section>
      ) : null}
    </div>
  );
}

function DeckList({ decks }: { decks: { id: string; name: string }[] }) {
  return (
    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {decks.map((deck) => (
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
  );
}
