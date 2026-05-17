import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { deleteCardWithCascade, restoreDeletedCard } from "@/db/deletion";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { usePendingDeletes } from "@/lib/pending-deletes-react";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";

export function DeckDetailPage({ deckId }: { deckId: string }) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null);
  const deckSet = useLiveQuery(
    async () => (deck?.deckSetId ? await db.deckSets.get(deck.deckSetId) : undefined),
    [deck?.deckSetId],
    undefined,
  );
  const cards = useLiveQuery(
    () => db.cards.where("deckId").equals(deckId).toArray(),
    [deckId],
    undefined,
  );
  const pending = usePendingDeletes();
  const pendingCardKeys = new Set(
    pending.filter((o) => o.state === "pending" && o.key.startsWith("card:")).map((o) => o.key),
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

  // Optimistic hide: filter out cards that have a pending-delete op.
  const visibleCards =
    cards === undefined ? undefined : cards.filter((c) => !pendingCardKeys.has(`card:${c.id}`));

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
        <div className="flex flex-wrap gap-2">
          <Link to="/deck/$deckId/review" params={{ deckId: deck.id }}>
            <Button>Lernen</Button>
          </Link>
          <Link to="/deck/$deckId/settings" params={{ deckId: deck.id }}>
            <Button variant="outline">Deck-Einstellungen</Button>
          </Link>
        </div>
      </div>

      {deck.description ? (
        <p className="whitespace-pre-line text-slate-700 dark:text-slate-300">{deck.description}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2">
        <h3 className="text-base font-medium">Cards</h3>
        <Link to="/deck/$deckId/card/new" params={{ deckId: deck.id }}>
          <Button>+ Neue Card</Button>
        </Link>
      </div>

      {visibleCards === undefined ? (
        <p className="text-sm text-slate-500">Lade Cards…</p>
      ) : visibleCards.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="mb-3 text-slate-600 dark:text-slate-400">Noch keine Cards angelegt.</p>
          <Link to="/deck/$deckId/card/new" params={{ deckId: deck.id }}>
            <Button>Erste Card anlegen</Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visibleCards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px]"
            >
              <Link
                to="/deck/$deckId/card/$cardId/edit"
                params={{ deckId: deck.id, cardId: card.id }}
                className="flex-1 truncate hover:underline"
              >
                {firstLine(card.front) || "(leere Vorderseite)"}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  // ADR-0014: Card-Delete läuft ohne Modal — nur Undo-Toast.
                  const store = getPendingDeletes();
                  let snapshot: Awaited<ReturnType<typeof deleteCardWithCascade>> | null = null;
                  store.enqueue({
                    key: `card:${card.id}`,
                    label: "Card gelöscht",
                    commit: async () => {
                      snapshot = await deleteCardWithCascade(card.id);
                    },
                    restore: async () => {
                      if (snapshot) await restoreDeletedCard(snapshot);
                    },
                  });
                }}
                aria-label="Card löschen"
              >
                Löschen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function firstLine(markdown: string): string {
  const line = markdown.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line
    .replace(/^#+\s*/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[Bild]")
    .trim();
}
