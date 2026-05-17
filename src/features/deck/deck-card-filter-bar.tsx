import { Button } from "@/components/ui/button";
import type { Card } from "@/domain/card";
import { tagCountsForFilter } from "@/domain/card";
import { cn } from "@/lib/cn";
import { useMemo } from "react";

export type DeckCardFilterStatus = "all" | "due";

export type DeckCardFilterState = {
  query: string;
  tags: string[];
  status: DeckCardFilterStatus;
};

export const EMPTY_FILTER_STATE: DeckCardFilterState = {
  query: "",
  tags: [],
  status: "all",
};

export function isFilterActive(state: DeckCardFilterState): boolean {
  return state.query.trim().length > 0 || state.tags.length > 0 || state.status !== "all";
}

export interface DeckCardFilterBarProps {
  cards: readonly Card[];
  dueCardIds: ReadonlySet<string> | undefined;
  state: DeckCardFilterState;
  onChange: (next: DeckCardFilterState) => void;
}

/**
 * Filter bar for the Deck-Detail-Page (issue #10).
 *
 * Combines three filters with AND-semantics: a case-insensitive substring
 * search on `front`/`back`, multi-select tag chips (AND-match), and a status
 * filter (`Alle` / `Nur Due`). Tag-chip counts reflect the *prefiltered*
 * card-set (search + status applied) so the user can see how each tag would
 * narrow the visible cards.
 *
 * Filter state is owned by the parent (Deck-Detail-Page) and *not* persisted
 * across navigation — re-entering the page resets the bar. See the ticket for
 * the rationale ("avoid 'why are only 3 cards here' confusion").
 *
 * Sticky positioning lets the bar stay visible while the card list scrolls;
 * mobile-first sizing keeps touch targets ≥ 44 px (ADR-0009).
 */
export function DeckCardFilterBar({ cards, dueCardIds, state, onChange }: DeckCardFilterBarProps) {
  const tagCounts = useMemo(
    () =>
      tagCountsForFilter(cards, {
        query: state.query,
        status: state.status,
        dueCardIds,
      }),
    [cards, state.query, state.status, dueCardIds],
  );

  const selectedTags = useMemo(() => new Set(state.tags), [state.tags]);

  // Selected-state visibility invariant (PR #43 round-3 review feedback):
  // a tag that the user has selected must remain visible — and toggle-off-
  // able from the chip itself — even when the search/status prefilter
  // reduces its count to zero. `tagCounts` is computed from the prefiltered
  // set so it may drop a selected tag entirely; we splice those tags back
  // in with `count: 0` so the chip stays rendered with `aria-pressed=true`.
  //
  // Why we keep them at the *end* (instead of merging by alpha): the natural
  // order of `tagCounts` is by frequency in the current prefilter; appending
  // the zero-count selected tags after that list keeps the user's attention
  // on the chips that still match real cards while still surfacing the
  // "stuck" selection so they can release it.
  const displayedTagCounts = useMemo(() => {
    const seen = new Set(tagCounts.map((t) => t.tag));
    const extras: { tag: string; count: number }[] = [];
    for (const tag of state.tags) {
      if (!seen.has(tag)) extras.push({ tag, count: 0 });
    }
    return extras.length === 0 ? tagCounts : [...tagCounts, ...extras];
  }, [tagCounts, state.tags]);

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange({ ...state, tags: Array.from(next) });
  };

  const setStatus = (status: DeckCardFilterStatus) => {
    onChange({ ...state, status });
  };

  return (
    <div className="sticky top-0 z-10 -mx-6 space-y-2 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <label className="sr-only" htmlFor="deck-card-search">
        Cards durchsuchen
      </label>
      <input
        id="deck-card-search"
        type="search"
        value={state.query}
        onChange={(e) => onChange({ ...state, query: e.target.value })}
        placeholder="Cards durchsuchen…"
        aria-label="Cards durchsuchen"
        className="w-full min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
      />

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Status-Filter</legend>
        <StatusButton
          active={state.status === "all"}
          onClick={() => setStatus("all")}
          label="Alle"
        />
        <StatusButton
          active={state.status === "due"}
          onClick={() => setStatus("due")}
          label="Nur Due"
        />
      </fieldset>

      {displayedTagCounts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {displayedTagCounts.map(({ tag, count }) => {
            const isSelected = selectedTags.has(tag);
            return (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900"
                      : "border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800",
                  )}
                >
                  <span>{tag}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      isSelected
                        ? "bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                    )}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function StatusButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className="min-h-[44px]"
    >
      {label}
    </Button>
  );
}
