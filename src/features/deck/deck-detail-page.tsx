import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { deleteCardWithCascade, restoreDeletedCard } from "@/db/deletion";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { useVisibleCards, useVisibleDeck, useVisibleDeckSet } from "@/lib/pending-deletes-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function DeckDetailPage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  // ADR-0014: route every read through the visibility-filtered hooks so a
  // pending-deleted deck (or any pending-deleted child card) cannot surface
  // here. `useVisibleDeck` returns `undefined` when the deck's
  // `deck:<id>` op is in the pending-delete window.
  const deck = useVisibleDeck(deckId);
  // Pass the parent deck-set id (may be undefined → hook resolves to
  // undefined). The hook itself enforces the pending-delete invariant for
  // deck-sets, which matters here because the deck-set row is rendered as
  // part of the deck-detail header.
  const deckSet = useVisibleDeckSet(deck?.deckSetId ?? "");
  const cards = useVisibleCards(() => db.cards.where("deckId").equals(deckId).toArray(), [deckId]);

  // Page-level pending-delete guard: a pending-deleted Deck must NOT remain
  // navigable during the 10s undo window. `useVisibleDeck` already hides the
  // row (returns `undefined`); we additionally redirect back to home so the
  // user sees the toast and not a "Deck nicht gefunden" branch glued open
  // by browser back/forward.
  const deckIsPending = useDeckIsPending(deckId);
  useEffect(() => {
    if (deckIsPending) {
      void navigate({ to: "/" });
    }
  }, [deckIsPending, navigate]);

  if (deck === null) {
    return <p className="text-sm text-slate-500">Lade Deck…</p>;
  }
  if (deckIsPending) {
    // Render nothing while the navigate effect resolves. The row is also
    // already filtered out of the home view.
    return null;
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

      {cards === undefined ? (
        <p className="text-sm text-slate-500">Lade Cards…</p>
      ) : cards.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="mb-3 text-slate-600 dark:text-slate-400">Noch keine Cards angelegt.</p>
          <Link to="/deck/$deckId/card/new" params={{ deckId: deck.id }}>
            <Button>Erste Card anlegen</Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {cards.map((card) => (
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

/**
 * Helper for the page-level redirect guard — subscribes to the
 * pending-deletes store and reports whether the deck row is hidden by the
 * visibility filter. Lives here (not in `pending-deletes-react.ts`) because
 * it is a per-callsite UX decision (redirect vs render-empty); the invariant
 * itself is enforced by `useVisibleDeck`.
 */
function useDeckIsPending(deckId: string): boolean {
  // We subscribe through `useVisibleDeck`'s machinery indirectly via
  // `getPendingDeletes().isPending`. To avoid duplicating
  // `usePendingDeletes()` (and to keep the redirect tight), we read the
  // store inline; the parent component already subscribes via `useVisibleDeck`.
  return getPendingDeletes().isPending(`deck:${deckId}`);
}
