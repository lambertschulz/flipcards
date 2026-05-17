import { Button } from "@/components/ui/button";
import { db } from "@/db/database";
import type { DeckSet } from "@/domain/deck-set";
import { INITIAL_REVIEW_STATE, type ReviewState } from "@/domain/sm2";
import { exportBackupToFile } from "@/features/backup/backup-export";
import {
  type DeckWithCounts,
  type HomeSummary,
  computeDecksWithCounts,
  computeHomeSummary,
} from "@/features/home/home-read-model";
import { StorageQuotaBanner } from "@/features/storage/storage-quota-banner";
import { useVisibleCards, useVisibleDeckSets, useVisibleDecks } from "@/lib/pending-deletes-react";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

/**
 * Tick `now` on a regular interval so time-dependent due counts refresh even
 * when the user keeps the home screen mounted across a `nextDue` boundary
 * without any Dexie write. Dexie's `useLiveQuery` only re-runs on table
 * mutations, never on wall-clock time — without this, a card scheduled for
 * "in one minute" stays in the non-due bucket until something unrelated
 * triggers a re-render.
 *
 * We pause the interval while the tab is hidden (no need to spin a timer
 * for an invisible UI) and force an immediate refresh on `visibilitychange`
 * so the user sees up-to-date counts the instant they return.
 *
 * 60 s matches the precision the badges and summary advertise ("X fällig").
 */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    if (typeof document !== "undefined" && document.hidden) {
      // Tab starts hidden — don't tick until it becomes visible.
    } else {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [intervalMs]);

  return now;
}

/**
 * Home-Screen (issue #20). Main entry into the app:
 *   • Heute-Resumee ("X Cards fällig in N Decks") above the list
 *   • Speicher-Banner (ADR-0013, ≥ 80 %/95 %)
 *   • Deck-Sets as collapsible groups + lose Decks below
 *   • Each Deck shows a Due-Count badge and total Card count
 *   • Empty state: three CTAs — eigenes Deck, Curated, Backup-Import (ADR-0009: no tour)
 *   • Header entry points to Tag-Session and Settings
 *   • Footer entry points to Curated- and Backup-Import
 *
 * We deliberately use the same `DeckListPage`-style hooks (Dexie `useLiveQuery`)
 * the previous deck-list relied on, plus the new pure read-model helpers from
 * `home-read-model.ts`. The pure helpers stay testable without the DOM; the
 * live-query bridge re-runs whenever decks/cards/review-states change.
 *
 * Sortierung (default per brief): "zuletzt-bearbeitet zuerst". The v1 schema
 * doesn't carry an `updatedAt` timestamp, so we fall back to alphabetical —
 * the brief lists alphabetical as the named alternative and Out-of-scope
 * already excludes the sort-toggle. See `home-read-model.ts` for the same note.
 *
 * Curated-Import / Backup-Import: the receiving routes don't exist yet —
 * the buttons announce that via an inline aria-described hint and stay
 * disabled. Wiring is the respective import-feature ticket's responsibility.
 */
export function HomePage() {
  // All entity-table reads go through the visibility-filtered hooks
  // (`useVisibleDecks` / `useVisibleDeckSets` / `useVisibleCards`) so the
  // ADR-0014 invariant — no read-model surfaces a row whose pending-delete
  // op is in `pending` or `committing` state, including cascade descendants
  // — is enforced uniformly. These hooks subscribe to the pending-deletes
  // store internally, so any op transition (pending → committing →
  // committed / undone) re-renders this component without an extra
  // `usePendingDeletes()` call.
  const visibleDecks = useVisibleDecks(() => db.decks.orderBy("name").toArray(), []);
  const visibleDeckSets = useVisibleDeckSets(() => db.deckSets.orderBy("name").toArray(), []);
  const visibleCards = useVisibleCards(() => db.cards.toArray(), []);
  // `reviewStates` is not subject to the pending-delete invariant — review
  // states for a pending-deleted card aren't *rendered*, only consumed by the
  // due-count read-model, which iterates `visibleCards`. Stale entries are
  // a no-op until they're filtered by the cascade commit.
  const reviewStates = useLiveQuery(() => db.reviewStates.toArray(), [], undefined);

  const loading =
    visibleDecks === undefined ||
    visibleDeckSets === undefined ||
    visibleCards === undefined ||
    reviewStates === undefined;

  // `now` ticks on a visibility-aware 60 s interval (see `useNow`). Dexie
  // live-queries only re-run on writes, so a wall-clock tick is needed to
  // refresh due counts when the user keeps the page mounted across a
  // `nextDue` boundary without any DB activity.
  const now = useNow();

  const stateLookup = useMemo(() => {
    const map = new Map<string, ReviewState>();
    for (const row of reviewStates ?? []) {
      map.set(row.cardId, {
        repetitions: row.repetitions,
        easeFactor: row.easeFactor,
        intervalDays: row.intervalDays,
        nextDue: row.nextDue,
      });
    }
    return (cardId: string) => map.get(cardId) ?? INITIAL_REVIEW_STATE;
  }, [reviewStates]);

  const decksWithCounts: DeckWithCounts[] = loading
    ? []
    : computeDecksWithCounts(visibleDecks ?? [], visibleCards ?? [], stateLookup, now);

  const summary: HomeSummary = loading
    ? { totalDue: 0, decksWithDue: 0 }
    : computeHomeSummary(visibleCards ?? [], stateLookup, now);

  const hasAny =
    !loading && ((visibleDecks ?? []).length > 0 || (visibleDeckSets ?? []).length > 0);

  return (
    <section className="space-y-4">
      <StorageQuotaBanner />

      <HomeHeader />

      {loading ? (
        <p className="text-sm text-slate-500">Lade Decks…</p>
      ) : !hasAny ? (
        <EmptyState />
      ) : (
        <>
          <TodayResume summary={summary} />
          <DeckGroups decks={decksWithCounts} deckSets={visibleDeckSets ?? []} />
        </>
      )}

      {hasAny ? <HomeFooter /> : null}
    </section>
  );
}

// --- Header ---------------------------------------------------------------

function HomeHeader() {
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-medium">Decks</h2>
      <div className="relative flex flex-wrap items-center gap-2">
        <NewMenuButton
          open={newOpen}
          onToggle={() => setNewOpen((v) => !v)}
          onClose={() => setNewOpen(false)}
        />
        <Link to="/tag-session" aria-label="Tag-Session starten" title="Tag-Session">
          <Button variant="outline" size="icon">
            <span aria-hidden="true">#</span>
          </Button>
        </Link>
        <Link to="/settings" aria-label="Einstellungen öffnen" title="Einstellungen">
          <Button variant="outline" size="icon">
            <span aria-hidden="true">⚙</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

function NewMenuButton({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <Button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Neues Deck oder Deck-Set anlegen"
      >
        + Neu
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <Link
            to="/deck/new"
            role="menuitem"
            onClick={onClose}
            className="block min-h-[44px] rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Neues Deck
          </Link>
          <Link
            to="/deck-set/new"
            role="menuitem"
            onClick={onClose}
            className="block min-h-[44px] rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Neues Deck-Set
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// --- Today summary --------------------------------------------------------

function TodayResume({ summary }: { summary: HomeSummary }) {
  if (summary.totalDue === 0) {
    return (
      <p className="text-sm text-slate-500" data-testid="home-summary">
        Heute keine Cards fällig — entspann dich oder lege neue an.
      </p>
    );
  }
  const cardWord = summary.totalDue === 1 ? "Card fällig" : "Cards fällig";
  const deckWord = summary.decksWithDue === 1 ? "Deck" : "Decks";
  return (
    <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="home-summary">
      {summary.totalDue} {cardWord} in {summary.decksWithDue} {deckWord}.
    </p>
  );
}

// --- Empty state ----------------------------------------------------------

function EmptyState() {
  return (
    <div className="space-y-3">
      <p className="text-slate-600 dark:text-slate-400">Willkommen — leg los, indem du:</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EmptyStateCard
          title="Eigenes Deck erstellen"
          description="Starte mit einem leeren Deck und füge eigene Cards hinzu."
          action={
            <Link to="/deck/new">
              <Button>Deck erstellen</Button>
            </Link>
          }
        />
        <EmptyStateCard
          title="Shared Deck importieren"
          description="Importiere ein Deck, das jemand mit dir geteilt hat."
          action={
            <Link to="/shared-deck/import">
              <Button variant="outline">Shared Deck importieren</Button>
            </Link>
          }
        />
        <EmptyStateCard
          title="Curated Deck wählen"
          description="Importiere ein vorbereitetes Deck aus der Bibliothek."
          action={
            <Button variant="outline" disabled aria-describedby="curated-coming">
              Curated importieren
            </Button>
          }
          hintId="curated-coming"
          hint="Bald verfügbar."
        />
        <EmptyStateCard
          title="Shared Deck-Set importieren"
          description="Importiere ein geteiltes Deck-Set (Set + alle enthaltenen Decks)."
          action={
            <Link to="/shared-deck-set/import">
              <Button variant="outline">Shared Deck-Set importieren</Button>
            </Link>
          }
        />
        <EmptyStateCard
          title="Backup wiederherstellen"
          description="Stelle deine Decks aus einer Backup-Datei wieder her."
          action={
            <Link to="/backup/import">
              <Button variant="outline">Backup importieren</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}

function EmptyStateCard({
  title,
  description,
  action,
  hint,
  hintId,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
  hint?: string;
  hintId?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="flex-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      <div>{action}</div>
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// --- Footer ---------------------------------------------------------------

function HomeFooter() {
  const [busy, setBusy] = useState(false);
  return (
    <footer className="space-y-2 pt-4 text-sm text-slate-600 dark:text-slate-400">
      <p className="font-medium">Mehr Inhalte</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/shared-deck/import">
          <Button variant="outline">Shared Deck importieren</Button>
        </Link>
        <Button variant="outline" disabled aria-describedby="footer-curated-coming">
          Curated importieren
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportBackupToFile();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Backup wird erstellt…" : "Backup exportieren"}
        </Button>
        <Link to="/shared-deck-set/import">
          <Button variant="outline">Shared Deck-Set importieren</Button>
        </Link>
        <Link to="/backup/import">
          <Button variant="outline">Backup importieren</Button>
        </Link>
      </div>
      <p id="footer-curated-coming" className="text-xs text-slate-500">
        Curated-Import folgt in einem eigenen Ticket.
      </p>
    </footer>
  );
}

// --- Deck groups ----------------------------------------------------------

function DeckGroups({
  decks,
  deckSets,
}: {
  decks: DeckWithCounts[];
  deckSets: DeckSet[];
}) {
  // IndexedDB has no FK enforcement, so a deck's deckSetId may reference a
  // set that no longer exists (stale import, partial restore, prior bug).
  // Treat such orphan references as lose decks so the deck stays visible
  // and the user can re-assign or clear the broken id from settings.
  const knownSetIds = new Set(deckSets.map((s) => s.id));
  const decksBySet = new Map<string | "__lose", DeckWithCounts[]>();
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
      {deckSets.map((set) => (
        <DeckSetGroup key={set.id} set={set} members={decksBySet.get(set.id) ?? []} />
      ))}

      {loseDecks.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-base font-medium text-slate-500">Lose Decks</h3>
          <DeckList decks={loseDecks} />
        </section>
      ) : null}
    </div>
  );
}

function DeckSetGroup({ set, members }: { set: DeckSet; members: DeckWithCounts[] }) {
  const [open, setOpen] = useState(true);
  const totalDue = members.reduce((sum, d) => sum + d.dueCount, 0);
  // Keep the collapse toggle and the navigation Link as siblings (never nested),
  // so the set name remains a navigable Link to the deck-set detail page while
  // the caret independently expands/collapses the inline member list. Wrapping
  // either inside the other would produce button-in-link / link-in-button,
  // which fails HTML validation and assistive-tech expectations.
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-h-[44px] items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `${set.name} einklappen` : `${set.name} ausklappen`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-base hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </button>
          <Link
            to="/deck-set/$deckSetId"
            params={{ deckSetId: set.id }}
            className="text-base font-medium hover:underline"
          >
            {set.name}
          </Link>
        </div>
        <span className="text-xs text-slate-500">
          {members.length === 1 ? "1 Deck" : `${members.length} Decks`}
          {totalDue > 0 ? ` · ${totalDue} fällig` : ""}
        </span>
      </div>
      {open ? (
        members.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700">
            Keine Decks in diesem Set.{" "}
            <Link
              to="/deck-set/$deckSetId"
              params={{ deckSetId: set.id }}
              className="underline underline-offset-2"
            >
              Decks hinzufügen
            </Link>
          </p>
        ) : (
          <DeckList decks={members} />
        )
      ) : null}
    </section>
  );
}

function DeckList({ decks }: { decks: DeckWithCounts[] }) {
  return (
    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {decks.map((deck) => (
        <li key={deck.id}>
          <Link
            to="/deck/$deckId"
            params={{ deckId: deck.id }}
            className="flex min-h-[44px] items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <span className="flex-1 truncate">{deck.name}</span>
            <DueBadge count={deck.dueCount} />
            <span className="text-xs text-slate-500 whitespace-nowrap">von {deck.totalCount}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DueBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-xs text-slate-400" aria-label="0 fällig">
        0 fällig
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-50 dark:bg-slate-50 dark:text-slate-900"
      aria-label={`${count} fällig`}
    >
      {count} fällig
    </span>
  );
}
