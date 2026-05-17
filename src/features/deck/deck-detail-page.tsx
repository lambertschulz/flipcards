import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { deleteCardWithCascade, restoreDeletedCard } from "@/db/deletion";
import { filterCards } from "@/domain/card";
import { isDue } from "@/domain/sm2";
import {
  DeckCardFilterBar,
  type DeckCardFilterState,
  EMPTY_FILTER_STATE,
  isFilterActive,
} from "@/features/deck/deck-card-filter-bar";
import { getPendingDeletes } from "@/lib/pending-deletes";
import { useVisibleCards, useVisibleDeck, useVisibleDeckSet } from "@/lib/pending-deletes-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

// Refresh interval for the "now" tick that drives the Due-set memo. 60s is
// short enough that newly-due cards appear quickly without the UI thrashing,
// and the interval is paused while the document is hidden.
const NOW_TICK_MS = 60_000;

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
  // Filter at the visibility-hook layer so pending-deleted cards never enter
  // the filter pipeline (search/tag/status) or the dueCardIds memo. This
  // keeps the issue-#10 feature consistent with ADR-0014: the user must not
  // see — nor be able to filter to — a row that is in its undo window.
  const cards = useVisibleCards(() => db.cards.where("deckId").equals(deckId).toArray(), [deckId]);
  // Review-states for the visible cards, used to derive the Due-id set for the
  // status filter. We load these here (not in the domain) to keep
  // `filterCards` pure — the domain accepts a pre-resolved `dueCardIds` set.
  // `useLiveQuery` re-runs when review-states change (e.g. after rating in a
  // session), so the "Nur Due" count stays accurate.
  const reviewStates = useLiveQuery(
    async () => {
      if (!cards || cards.length === 0) return [];
      return db.reviewStates
        .where("cardId")
        .anyOf(cards.map((c) => c.id))
        .toArray();
    },
    [cards],
    undefined,
  );

  // Filter state is page-local and intentionally not persisted across
  // navigation (ticket requirement: avoid "why are only 3 cards here?"
  // confusion when re-entering the page). The parent route is keyed by
  // `deckId` (see src/app/routes.tsx), so navigating to a different deck
  // remounts this component and resets the filter to `EMPTY_FILTER_STATE`.
  const [filter, setFilter] = useState<DeckCardFilterState>(EMPTY_FILTER_STATE);

  // Ticking clock that drives the Due-set memo. Without this, the memo would
  // capture `Date.now()` only when `cards`/`reviewStates` change — so if the
  // user keeps the page open past a card's `nextDue` time without any DB
  // write, toggling "Nur Due" or typing into the search would keep the stale
  // Due-set and newly-due cards would stay hidden (PR #43 review feedback).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (intervalId !== undefined) return;
      intervalId = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    };
    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stop();
      } else {
        // Refresh immediately when the tab becomes visible again so a
        // long-backgrounded page doesn't show a stale Due-set for up to
        // NOW_TICK_MS after returning.
        setNow(Date.now());
        start();
      }
    };
    if (typeof document !== "undefined" && document.hidden) {
      // Don't tick while hidden; visibilitychange will start the interval.
    } else {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, []);

  const dueCardIds = useMemo<Set<string> | undefined>(() => {
    if (!cards || reviewStates === undefined) return undefined;
    const stateById = new Map(reviewStates.map((s) => [s.cardId, s]));
    const ids = new Set<string>();
    for (const card of cards) {
      const state = stateById.get(card.id);
      // Cards without a Review-State are due by definition (first-seen).
      if (!state || isDue(state, now)) ids.add(card.id);
    }
    return ids;
  }, [cards, reviewStates, now]);

  const visibleCards = useMemo(() => {
    if (!cards) return undefined;
    return filterCards(cards, {
      query: filter.query,
      tags: filter.tags,
      status: filter.status,
      dueCardIds,
    });
  }, [cards, filter, dueCardIds]);

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

  const totalCards = cards?.length ?? 0;
  const filterIsActive = isFilterActive(filter);

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
        <>
          <DeckCardFilterBar
            cards={cards}
            dueCardIds={dueCardIds}
            state={filter}
            onChange={setFilter}
          />

          {visibleCards && visibleCards.length === 0 ? (
            <output className="block rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <p className="mb-3 text-slate-600 dark:text-slate-400">
                Keine Cards passen zu den aktuellen Filtern.
              </p>
              <Button type="button" variant="outline" onClick={() => setFilter(EMPTY_FILTER_STATE)}>
                Filter zurücksetzen
              </Button>
            </output>
          ) : (
            <>
              {filterIsActive && visibleCards ? (
                <p className="text-sm text-slate-500">
                  {visibleCards.length} von {totalCards} Cards
                </p>
              ) : null}
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {(visibleCards ?? []).map((card) => (
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
                        let snapshot: Awaited<ReturnType<typeof deleteCardWithCascade>> | null =
                          null;
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
            </>
          )}
        </>
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
