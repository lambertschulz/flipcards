import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import { addDeckToSetInDb, removeDeckFromSetInDb } from "@/db/deck-sets";
import { useVisibleDeckSet, useVisibleDecks } from "@/lib/pending-deletes-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Deck-Set detail view. Lists member decks and, when the user opens the
 * "Decks hinzufügen" picker, shows every deck *not* already in this set
 * (lose decks and decks from other sets — picking one of the latter moves
 * it, per ADR-0003). Removing the last deck leaves the set empty and
 * intact (ADR-0014).
 *
 * Reads go through the visibility-filtered hooks in
 * `@/lib/pending-deletes-react` (ADR-0014 invariant): pending-deleted
 * deck-sets and pending-deleted member/addable decks must not surface here.
 */
export function DeckSetDetailPage({ deckSetId }: { deckSetId: string }) {
  const set = useVisibleDeckSet(deckSetId);
  const memberDecks = useVisibleDecks(
    () => db.decks.where("deckSetId").equals(deckSetId).toArray(),
    [deckSetId],
  );
  const addableDecks = useVisibleDecks(
    () => db.decks.filter((d) => d.deckSetId !== deckSetId).toArray(),
    [deckSetId],
  );

  const [pickerOpen, setPickerOpen] = useState(false);

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

  const sortedMembers = (memberDecks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const sortedAddable = (addableDecks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{set.name}</h2>
          {set.description ? (
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
              {set.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/deck-set/$deckSetId/settings" params={{ deckSetId: set.id }}>
            <Button variant="outline">Deck-Set-Einstellungen</Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <h3 className="text-base font-medium">Decks im Set</h3>
        <Button type="button" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? "Schließen" : "+ Decks hinzufügen"}
        </Button>
      </div>

      {memberDecks === undefined ? (
        <p className="text-sm text-slate-500">Lade Decks…</p>
      ) : sortedMembers.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400">
            Noch keine Decks in diesem Set. Über „+ Decks hinzufügen" lassen sich lose Decks oder
            Decks anderer Sets hinzufügen.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {sortedMembers.map((deck) => (
            <li
              key={deck.id}
              className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px]"
            >
              <Link
                to="/deck/$deckId"
                params={{ deckId: deck.id }}
                className="flex-1 truncate hover:underline"
              >
                {deck.name}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await removeDeckFromSetInDb(deck.id);
                }}
                aria-label={`Deck ${deck.name} aus Set entfernen`}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <DeckPicker
          decks={sortedAddable}
          loading={addableDecks === undefined}
          onAdd={async (deckId) => {
            await addDeckToSetInDb(deckId, set.id);
          }}
        />
      ) : null}
    </section>
  );
}

function DeckPicker({
  decks,
  loading,
  onAdd,
}: {
  decks: { id: string; name: string; deckSetId?: string }[];
  loading: boolean;
  onAdd: (deckId: string) => Promise<void>;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Lade Decks…</p>;
  }
  if (decks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
        <p className="text-slate-600 dark:text-slate-400">
          Keine weiteren Decks vorhanden. Lege erst ein Deck an.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Hinzufügbare Decks</h4>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {decks.map((deck) => (
          <li
            key={deck.id}
            className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px]"
          >
            <span className="flex-1 truncate">
              {deck.name}
              {deck.deckSetId ? (
                <span className="ml-2 text-xs text-slate-500">
                  (in anderem Set — wird verschoben)
                </span>
              ) : (
                <span className="ml-2 text-xs text-slate-500">(lose)</span>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await onAdd(deck.id);
              }}
              aria-label={`Deck ${deck.name} zum Set hinzufügen`}
            >
              Hinzufügen
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
